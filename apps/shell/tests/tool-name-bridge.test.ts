import { afterEach, describe, expect, it } from 'vitest'
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  buildToolNameMap,
  createSseRewriter,
  declaredToolNames,
  rewritePayload,
  rewriteSseLine,
  startToolNameBridge,
  type ToolNameBridge,
} from '../src/main/tool-name-bridge.js'

const AUTH = 'Bearer freecode-public'
type Handler = (req: IncomingMessage, res: ServerResponse) => void
interface Seen { method?: string; url?: string; headers: IncomingMessage['headers']; body: string }
interface Upstream { url: string; seen: Seen[]; server: Server; setHandler(handler: Handler): void }

const cleanups: Array<() => Promise<unknown> | unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function startUpstream(initial: Handler): Promise<Upstream> {
  const seen: Seen[] = []
  let handler = initial
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
      handler(req, res)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const upstream: Upstream = { url: `http://127.0.0.1:${port}`, seen, server, setHandler: next => { handler = next } }
  cleanups.push(() => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()) }))
  return upstream
}

async function startBridge(target: () => string, log?: (level: string, msg: string, meta?: Record<string, unknown>) => void): Promise<ToolNameBridge> {
  const bridge = await startToolNameBridge({ target, log })
  cleanups.push(() => bridge.close())
  return bridge
}

function completionBody(toolNames: string[], stream = false, content = 'Run Get-Date'): string {
  return JSON.stringify({
    model: 'deepseek-v4.1-flash-free',
    stream,
    tools: toolNames.map(name => ({ type: 'function', function: { name, parameters: { type: 'object', properties: {} } } })),
    messages: [{ role: 'user', content }],
  })
}

function post(bridgeUrl: string, body: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${bridgeUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: AUTH, ...headers },
    body,
  })
}

function toolCallJson(name: string): string {
  return JSON.stringify({
    id: 'resp-1',
    object: 'chat.completion',
    choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: '{"command":"Get-Date"}' } }] } }],
  })
}

function streamToolEvent(name: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name, arguments: '' } }] } }] })}\n\n`
}

function rawGet(bridgeUrl: string, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(new URL(bridgeUrl), { method: 'GET', path }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })
}

describe('buildToolNameMap', () => {
  it('maps shell to a declared pwsh', () => {
    const map = buildToolNameMap(['pwsh', 'read'])
    expect(map.get('shell')).toBe('pwsh')
    expect(map.size).toBe(1)
  })

  it('never remaps when the official name is declared', () => {
    expect(buildToolNameMap(['pwsh', 'shell']).size).toBe(0)
  })

  it('maps nothing when no equivalent is declared', () => {
    expect(buildToolNameMap(['bash', 'read']).size).toBe(0)
  })

  it('reads declared names from an OpenAI-style body', () => {
    expect(declaredToolNames({ tools: [{ type: 'function', function: { name: 'pwsh' } }, { type: 'function' }] })).toEqual(['pwsh'])
    expect(declaredToolNames({})).toEqual([])
  })
})

describe('rewritePayload', () => {
  it('renames only tool call names, keeping ids and arguments', () => {
    const payload = {
      choices: [{ message: { tool_calls: [
        { id: 'a1', type: 'function', function: { name: 'shell', arguments: '{"command":"x"}' } },
        { id: 'b2', type: 'function', function: { name: 'read', arguments: '{"path":"y"}' } },
      ] } }],
    }
    const changed = rewritePayload(payload, new Map([['shell', 'pwsh']]))
    expect(changed).toBe(true)
    expect(payload.choices[0]?.message.tool_calls).toEqual([
      { id: 'a1', type: 'function', function: { name: 'pwsh', arguments: '{"command":"x"}' } },
      { id: 'b2', type: 'function', function: { name: 'read', arguments: '{"path":"y"}' } },
    ])
    expect(rewritePayload({ choices: [] }, new Map([['shell', 'pwsh']]))).toBe(false)
  })
})

describe('rewriteSseLine and createSseRewriter', () => {
  const map = new Map([['shell', 'pwsh']])

  it('renames a delta tool call and leaves other lines byte-for-byte', () => {
    const line = streamToolEvent('shell').trimEnd()
    expect(rewriteSseLine(line, map)).toBe(streamToolEvent('pwsh').trimEnd())
    expect(rewriteSseLine(': keep-alive', map)).toBe(': keep-alive')
    expect(rewriteSseLine('data: [DONE]', map)).toBe('data: [DONE]')
    expect(rewriteSseLine('data: {bad tool_calls', map)).toBe('data: {bad tool_calls')
    const content = 'data: {"choices":[{"delta":{"content":"hi"}}]}'
    expect(rewriteSseLine(content, map)).toBe(content)
  })

  it('keeps carriage returns on rewritten lines', () => {
    expect(rewriteSseLine(`${streamToolEvent('shell').trimEnd()}\r`, map)).toBe(`${streamToolEvent('pwsh').trimEnd()}\r`)
  })

  it('gives the same output when one event is split across chunks, including inside a UTF-8 character', () => {
    const base = `${streamToolEvent('shell')}data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'héllo ✓' } }] })}\n\n`
    for (const text of [base, base.replace(/\n/g, '\r\n')]) {
      const expected = text.replace('"name":"shell"', '"name":"pwsh"')
      const bytes = new TextEncoder().encode(text)
      const split = bytes.indexOf(0xe2) + 1
      expect(split).toBeGreaterThan(1)

      const whole = createSseRewriter(map)
      const wholeOut = whole.push(bytes) + whole.flush()
      const parts = createSseRewriter(map)
      const splitOut = parts.push(bytes.subarray(0, split)) + parts.push(bytes.subarray(split)) + parts.flush()

      expect(splitOut).toBe(wholeOut)
      expect(wholeOut).toBe(expected)
    }
  })
})

describe('tool-name bridge over HTTP', () => {
  it('rewrites a JSON completion and fixes content-length', async () => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(toolCallJson('shell'))
    })
    const bridge = await startBridge(() => upstream.url)
    const res = await post(bridge.url, completionBody(['pwsh']))
    const text = await res.text()
    const json = JSON.parse(text)
    expect(json.choices[0].message.tool_calls[0].function.name).toBe('pwsh')
    expect(res.headers.get('content-length')).toBe(String(Buffer.byteLength(text)))
  })

  it('rewrites a streamed completion and keeps the other events', async () => {
    const contentEvent = 'data: {"choices":[{"index":0,"delta":{"content":"ok"}}]}\n\n'
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(streamToolEvent('shell'))
      res.write(contentEvent)
      res.end('data: [DONE]\n\n')
    })
    const bridge = await startBridge(() => upstream.url)
    const text = await (await post(bridge.url, completionBody(['pwsh'], true))).text()
    expect(text).toContain(streamToolEvent('pwsh'))
    expect(text).not.toContain('"name":"shell"')
    expect(text).toContain(contentEvent)
    expect(text.endsWith('data: [DONE]\n\n')).toBe(true)
  })

  it('passes bytes through unchanged when pwsh is not declared', async () => {
    const upstreamBody = toolCallJson('shell')
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(upstreamBody)
    })
    const bridge = await startBridge(() => upstream.url)
    const text = await (await post(bridge.url, completionBody(['read']))).text()
    expect(text).toBe(upstreamBody)
  })

  it('forwards the body byte-for-byte, the authorization header and accept-encoding identity', async () => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
    const bridge = await startBridge(() => upstream.url)
    const sent = completionBody(['pwsh'], false, 'Ejecutá Get-Date — ✓')
    await post(bridge.url, sent)
    const seen = upstream.seen[0] as Seen
    expect(seen.body).toBe(sent)
    expect(seen.headers.authorization).toBe(AUTH)
    expect(seen.headers['accept-encoding']).toBe('identity')
  })

  it('passes GET /v1/models through unchanged', async () => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"data":[]}')
    })
    const bridge = await startBridge(() => upstream.url)
    const res = await fetch(`${bridge.url}/v1/models`, { headers: { authorization: AUTH } })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"data":[]}')
  })

  it('passes an upstream 429 through with retry-after', async () => {
    const errorBody = '{"error":{"message":"rate limited","type":"rate_limit"}}'
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '7' })
      res.end(errorBody)
    })
    const bridge = await startBridge(() => upstream.url)
    const res = await post(bridge.url, completionBody(['pwsh']))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('7')
    expect(await res.text()).toBe(errorBody)
  })

  it('answers 502 bridge_error when the gateway is down, then serves the next request', async () => {
    const dead = await startUpstream(() => undefined)
    await new Promise<void>(done => { dead.server.close(() => done()) })
    const live = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(toolCallJson('shell'))
    })
    let target = dead.url
    const bridge = await startBridge(() => target)

    const failed = await post(bridge.url, completionBody(['pwsh']))
    expect(failed.status).toBe(502)
    expect((await failed.json()).error.type).toBe('bridge_error')

    target = live.url
    const ok = await post(bridge.url, completionBody(['pwsh']))
    expect(ok.status).toBe(200)
    expect((await ok.json()).choices[0].message.tool_calls[0].function.name).toBe('pwsh')
  })

  it('refuses a non-loopback target with 502 and a // path with 400', async () => {
    const bridge = await startBridge(() => 'http://example.com')
    const res = await post(bridge.url, completionBody(['pwsh']))
    expect(res.status).toBe(502)
    expect((await res.json()).error.type).toBe('bridge_error')

    const local = await startBridge(() => 'http://127.0.0.1:9')
    expect(await rawGet(local.url, '//v1/models')).toBe(400)
  })

  it('destroys the upstream request when the client aborts mid-stream', async () => {
    let upstreamClosed!: () => void
    const closed = new Promise<void>(resolve => { upstreamClosed = resolve })
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(streamToolEvent('shell'))
      res.on('close', () => upstreamClosed())
    })
    const bridge = await startBridge(() => upstream.url)
    const controller = new AbortController()
    const res = await fetch(`${bridge.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: AUTH },
      body: completionBody(['pwsh'], true),
      signal: controller.signal,
    })
    const reader = res.body!.getReader()
    await reader.read()
    controller.abort()
    await expect(closed).resolves.toBeUndefined()
  })

  it('reads the target on every request', async () => {
    const first = await startUpstream((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}') })
    const second = await startUpstream((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}') })
    let target = first.url
    const bridge = await startBridge(() => target)
    await post(bridge.url, completionBody(['pwsh']))
    target = second.url
    await post(bridge.url, completionBody(['pwsh']))
    expect(first.seen).toHaveLength(1)
    expect(second.seen).toHaveLength(1)
  })

  it('never logs the request body or the authorization value', async () => {
    const logs: string[] = []
    const secretPrompt = 'SECRET-PROMPT-123'
    const secretKey = 'sk-test-KEY-999'
    const bridge = await startBridge(() => 'http://127.0.0.1:9', (level, msg, meta) => {
      logs.push(`${level} ${msg} ${JSON.stringify(meta ?? {})}`)
    })
    await post(bridge.url, completionBody(['pwsh'], false, secretPrompt), { authorization: `Bearer ${secretKey}` })
    expect(logs.length).toBeGreaterThan(0)
    const joined = logs.join('\n')
    expect(joined).not.toContain(secretPrompt)
    expect(joined).not.toContain(secretKey)
  })

  it('close() resolves and the port stops accepting connections', async () => {
    const upstream = await startUpstream((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}') })
    const bridge = await startToolNameBridge({ target: () => upstream.url })
    await bridge.close()
    await expect(fetch(`${bridge.url}/v1/models`)).rejects.toThrow()
  })
})
