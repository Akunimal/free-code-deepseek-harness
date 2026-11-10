import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * The free model lane reshapes requests to look like the OpenCode CLI: harness tools get opaque
 * wire names and OpenCode's own tools are appended. An official tool with no declared equivalent
 * comes back under its official name, which the harness does not have, and the gateway then drops
 * that call from the history. This table names the harness tools that serve an official tool.
 */
export const OFFICIAL_TOOL_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = {
  shell: ['pwsh'],
}

const MAX_REQUEST_BYTES = 256 * 1024 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const SKIPPED_REQUEST_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'host', 'content-length', 'accept-encoding',
])
const SKIPPED_RESPONSE_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding'])

export type ToolNameMap = ReadonlyMap<string, string>

export function declaredToolNames(body: unknown): string[] {
  const tools = (body as { tools?: unknown } | null)?.tools
  if (!Array.isArray(tools)) return []
  const names: string[] = []
  for (const tool of tools) {
    const name = (tool as { function?: { name?: unknown } } | null)?.function?.name
    if (typeof name === 'string') names.push(name)
  }
  return names
}

/** Map an official name only when the client lacks it and declares an equivalent. */
export function buildToolNameMap(declared: readonly string[]): Map<string, string> {
  const known = new Set(declared)
  const map = new Map<string, string>()
  for (const [official, candidates] of Object.entries(OFFICIAL_TOOL_EQUIVALENTS)) {
    if (known.has(official)) continue
    const target = candidates.find(candidate => known.has(candidate))
    if (target !== undefined) map.set(official, target)
  }
  return map
}

function rewriteCalls(calls: unknown, map: ToolNameMap): boolean {
  if (!Array.isArray(calls)) return false
  let changed = false
  for (const call of calls) {
    const fn = (call as { function?: { name?: unknown } } | null)?.function
    if (fn === undefined || fn === null || typeof fn.name !== 'string') continue
    const target = map.get(fn.name)
    if (target === undefined) continue
    fn.name = target
    changed = true
  }
  return changed
}

/** Rewrite tool names in one completion body or one stream chunk. Returns true when changed. */
export function rewritePayload(payload: unknown, map: ToolNameMap): boolean {
  const choices = (payload as { choices?: unknown } | null)?.choices
  if (!Array.isArray(choices)) return false
  let changed = false
  for (const choice of choices) {
    const entry = choice as { message?: { tool_calls?: unknown }, delta?: { tool_calls?: unknown } } | null
    if (rewriteCalls(entry?.message?.tool_calls, map)) changed = true
    if (rewriteCalls(entry?.delta?.tool_calls, map)) changed = true
  }
  return changed
}

export function rewriteSseLine(line: string, map: ToolNameMap): string {
  if (!line.startsWith('data:') || !line.includes('tool_calls')) return line
  const carriage = line.endsWith('\r') ? '\r' : ''
  const data = line.slice(5, carriage === '' ? undefined : -1).trim()
  if (data === '[DONE]') return line
  try {
    const json: unknown = JSON.parse(data)
    return rewritePayload(json, map) ? `data: ${JSON.stringify(json)}${carriage}` : line
  } catch {
    return line
  }
}

/** Line-buffered stream rewriter. A partial trailing line waits for its newline. */
export function createSseRewriter(map: ToolNameMap): { push(chunk: Uint8Array): string, flush(): string } {
  const decoder = new TextDecoder()
  let pending = ''
  return {
    push(chunk) {
      pending += decoder.decode(chunk, { stream: true })
      const cut = pending.lastIndexOf('\n')
      if (cut < 0) return ''
      const complete = pending.slice(0, cut)
      pending = pending.slice(cut + 1)
      return `${complete.split('\n').map(line => rewriteSseLine(line, map)).join('\n')}\n`
    },
    flush() {
      const rest = pending + decoder.decode()
      pending = ''
      return rest.length > 0 ? rewriteSseLine(rest, map) : ''
    },
  }
}

export interface ToolNameBridgeOptions {
  /** Current gateway origin, for example http://127.0.0.1:8080. Read on every request. */
  target: () => string
  log?: (level: string, msg: string, meta?: Record<string, unknown>) => void
}

export interface ToolNameBridge {
  url: string
  port: number
  close(): Promise<void>
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse, options: ToolNameBridgeOptions): Promise<void> {
  const path = req.url ?? '/'
  if (!path.startsWith('/') || path.startsWith('//')) {
    res.writeHead(400).end()
    return
  }
  const upstreamUrl = new URL(path, options.target())
  if (upstreamUrl.protocol !== 'http:' || !LOOPBACK_HOSTS.has(upstreamUrl.hostname)) {
    throw new Error('bridge target is not a loopback http gateway')
  }
  const body = await readBody(req)
  let map: ToolNameMap = new Map()
  if (req.method === 'POST' && upstreamUrl.pathname.endsWith('/chat/completions') && body.length > 0) {
    try {
      map = buildToolNameMap(declaredToolNames(JSON.parse(body.toString('utf8'))))
    } catch {
      // Not JSON: forwarded unchanged with no mapping.
    }
  }
  const headers: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined && !SKIPPED_REQUEST_HEADERS.has(key)) headers[key] = value
  }
  headers['accept-encoding'] = 'identity'
  if (body.length > 0) headers['content-length'] = String(body.length)

  await new Promise<void>((resolve, reject) => {
    const upstream = httpRequest(upstreamUrl, { method: req.method, headers }, (up) => {
      const status = up.statusCode ?? 502
      const type = String(up.headers['content-type'] ?? '')
      const out: Record<string, string | string[]> = {}
      for (const [key, value] of Object.entries(up.headers)) {
        if (value !== undefined && !SKIPPED_RESPONSE_HEADERS.has(key)) out[key] = value
      }
      up.on('error', reject)
      if (map.size === 0 || status >= 400 || !(type.includes('text/event-stream') || type.includes('application/json'))) {
        res.writeHead(status, out)
        up.pipe(res)
        return
      }
      delete out['content-length']
      if (type.includes('text/event-stream')) {
        res.writeHead(status, out)
        const rewriter = createSseRewriter(map)
        up.on('data', (chunk: Buffer) => {
          const text = rewriter.push(chunk)
          if (text.length > 0) res.write(text)
        })
        up.on('end', () => res.end(rewriter.flush()))
        return
      }
      const parts: Buffer[] = []
      up.on('data', (chunk: Buffer) => parts.push(chunk))
      up.on('end', () => {
        const raw = Buffer.concat(parts)
        let payload = raw
        try {
          const json: unknown = JSON.parse(raw.toString('utf8'))
          if (rewritePayload(json, map)) payload = Buffer.from(JSON.stringify(json), 'utf8')
        } catch {
          // Unreadable body: forwarded as received.
        }
        res.writeHead(status, { ...out, 'content-length': String(payload.length) })
        res.end(payload)
      })
    })
    upstream.on('error', reject)
    res.on('close', () => {
      upstream.destroy()
      resolve()
    })
    upstream.end(body)
  })
}

/** Start the in-process bridge on a free loopback port. */
export function startToolNameBridge(options: ToolNameBridgeOptions): Promise<ToolNameBridge> {
  const server = createServer((req, res) => {
    handle(req, res, options).catch((error: unknown) => {
      // Never log bodies or headers: they carry prompts and keys.
      options.log?.('warn', 'tool-name bridge request failed', { error: String(error) })
      if (res.headersSent) {
        res.destroy()
        return
      }
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'FreeCode tool-name bridge could not reach the model gateway', type: 'bridge_error' } }))
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise<void>((done) => {
          server.closeAllConnections()
          server.close(() => done())
        }),
      })
    })
  })
}
