#!/usr/bin/env node
/**
 * Black-box MCP release gate using repository-owned stdio fixtures only.
 *
 * It launches the packaged DSH CLI in Electron's Node mode, starts two local
 * fixture MCP servers, and connects the CLI to a loopback-only mock provider.
 * No package manager, external MCP server, remote URL, or user profile is used.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createReleaseSmokeEnvironment } from './release-smoke-environment.mjs'

if (process.platform !== 'win32') {
  throw new Error('mcp-offline-smoke: Windows-only release gate')
}

const root = resolve(import.meta.dirname, '..')
const runtimeRoot = resolve(process.argv[2] ?? join(root, 'apps', 'shell', 'resources', 'freecode', 'dsh'))
const cliEntry = join(runtimeRoot, 'apps', 'cli', 'lib', 'bin.js')
if (!existsSync(cliEntry)) throw new Error(`mcp-offline-smoke: runtime CLI missing: ${cliEntry}`)

// Native modules in the pinned DSH runtime target Electron's ABI. Use the
// packaged Electron as a hidden Node host, not the developer's Node process.
const electronCandidates = [
  join(root, 'apps', 'shell', 'node_modules', 'electron', 'dist', 'electron.exe'),
  join(root, 'apps', 'shell', 'release', 'win-unpacked', 'FreeCode DeepSeek Harness.exe'),
]
const dshNodePath = electronCandidates.find((candidate) => existsSync(candidate))
if (dshNodePath === undefined) {
  throw new Error(`mcp-offline-smoke: Electron runtime missing; checked ${electronCandidates.join(', ')}`)
}

const scratch = mkdtempSync(join(tmpdir(), `freecode-mcp-offline-${process.pid}-`))
const project = join(scratch, 'project')
const home = join(scratch, 'dsh-home')
const smokeEnvironment = createReleaseSmokeEnvironment({
  systemRoot: process.env.SystemRoot ?? process.env.WINDIR,
  nodeExecutable: process.execPath,
  smokeRoot: scratch,
})
for (const path of [project, smokeEnvironment.HOME, smokeEnvironment.APPDATA,
  smokeEnvironment.LOCALAPPDATA, smokeEnvironment.TEMP, home]) {
  mkdirSync(path, { recursive: true })
}

const fixturePath = resolve(root, 'scripts', 'mcp-fixture-server.mjs')
const runtimeRequire = createRequire(cliEntry)
const { Client } = runtimeRequire('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = runtimeRequire('@modelcontextprotocol/sdk/client/stdio.js')
const mcpHomeUrl = pathToFileURL(resolve(root, 'apps', 'shell', 'dist', 'src', 'main', 'mcp-home.js')).href
const { ensureEmbeddedMcpConfig } = await import(mcpHomeUrl)
ensureEmbeddedMcpConfig(home, {
  serverOverrides: {
    engram: { command: process.execPath, args: [fixturePath, 'engram'] },
    'free-search': { command: process.execPath, args: [fixturePath, 'free-search'] },
  },
})
// The built-in web preset fixes the MCP argument vectors to `mcp` and
// `free-search-mcp`. Route those two commands to Node and place extensionless
// test-owned entrypoints in the scratch project; no YAML profile override or
// external executable is needed.
for (const [command, serverId] of [['mcp', 'engram'], ['free-search-mcp', 'free-search']]) {
  writeFileSync(join(project, command), [
    `process.argv[2] = ${JSON.stringify(serverId)}`,
    `import(${JSON.stringify(pathToFileURL(fixturePath).href)})`,
  ].join('\n') + '\n', { encoding: 'utf8', mode: 0o600 })
}

function timeout(promise, ms, label) {
  let timer
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    timer.unref()
  })
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer))
}

async function probeFixture({ id, toolName }) {
  const client = new Client({ name: 'freecode-offline-release-smoke', version: '0.9.3' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixturePath, id],
    cwd: project,
    env: smokeEnvironment,
    stderr: 'pipe',
  })
  let stderr = ''
  transport.stderr?.on('data', (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-2_048) })
  try {
    await timeout(client.connect(transport), 15_000, `${id} fixture initialize`)
    const listed = await timeout(client.listTools(), 10_000, `${id} fixture tools/list`)
    const tool = listed.tools.find((candidate) => candidate.name === toolName)
    if (tool === undefined || typeof tool.inputSchema !== 'object' || tool.inputSchema === null) {
      throw new Error(`${id} fixture did not expose ${toolName} with an input schema`)
    }
    const result = await timeout(client.callTool({ name: tool.name, arguments: {} }), 10_000, `${id} fixture tools/call`)
    const text = result.content?.find((item) => item.type === 'text')?.text
    if (result.isError === true || text !== `${id}:${toolName}:ok`) {
      throw new Error(`${id} fixture returned an invalid tools/call result`)
    }
    console.log(`mcp-offline-smoke: ${id} fixture initialize/list/call passed`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`mcp-offline-smoke: ${id} fixture failed: ${detail}${stderr.trim() ? `\n${stderr.trim()}` : ''}`)
  } finally {
    try { await timeout(client.close(), 5_000, `${id} fixture close`) } catch { /* child cleanup below */ }
  }
}

await probeFixture({ id: 'engram', toolName: 'smoke_status' })
await probeFixture({ id: 'free-search', toolName: 'engines' })

function cleanupScratch() {
  const absoluteScratch = resolve(scratch)
  const absoluteTemp = resolve(tmpdir())
  const prefix = absoluteTemp.endsWith(sep) ? absoluteTemp : `${absoluteTemp}${sep}`
  if (!absoluteScratch.startsWith(prefix)) {
    throw new Error(`mcp-offline-smoke: refusing to clean outside OS temp: ${absoluteScratch}`)
  }
  rmSync(absoluteScratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

const providerRequests = []
const targetTool = 'mcp__free-search__engines'
const provider = createServer((request, response) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    try {
      const parsed = JSON.parse(body)
      if (Array.isArray(parsed.messages)) {
        providerRequests.push(parsed)
        console.log(`mcp-offline-smoke: loopback provider received ${parsed.messages.length} Messages item(s)`)
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      })
      const events = [
        {
          type: 'message_start',
          message: {
            id: 'msg_offline_release_smoke',
            type: 'message',
            role: 'assistant',
            model: parsed.model ?? 'deepseek-flash',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'offline MCP smoke response' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
        { type: 'message_stop' },
      ]
      response.end(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
    } catch (error) {
      response.writeHead(400, { 'content-type': 'text/plain' })
      response.end(error instanceof Error ? error.message : String(error))
    }
  })
})

let child
let output = ''
let smokeError
let preserveScratchOnFailure = false
const reportedReady = new Set()
try {
  await new Promise((resolveListen, reject) => {
    provider.once('error', reject)
    provider.listen(0, '127.0.0.1', resolveListen)
  })
  const address = provider.address()
  if (address === null || typeof address === 'string') throw new Error('mcp-offline-smoke: provider did not bind a loopback TCP port')

  child = spawn(dshNodePath, [
    cliEntry,
    'web',
    '--port', '0',
    '--host', '127.0.0.1',
    '--no-open',
  ], {
    cwd: project,
    env: {
      ...smokeEnvironment,
      DSH_HOME: home,
      FREECODE_WEB_MODE: '1',
      FREECODE_MCP_ENGRAM_ENABLED: 'true',
      FREECODE_MCP_FREE_SEARCH_ENABLED: 'true',
      FREECODE_ENGRAM_COMMAND: process.execPath,
      FREECODE_UVX_COMMAND: process.execPath,
      FREECODE_MCP_STATUS_STREAM: 'stderr',
      DEEPSEEK_API_KEY: 'freecode-offline-mcp-smoke-key',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${String(address.port)}`,
      ELECTRON_RUN_AS_NODE: '1',
    },
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const append = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-12_000)
    for (const id of ['engram', 'free-search']) {
      if (!reportedReady.has(id) && new RegExp(`"serverId"\\s*:\\s*"${id}"\\s*,\\s*"state"\\s*:\\s*"ready"`).test(output)) {
        reportedReady.add(id)
        console.log(`mcp-offline-smoke: DSH ${id} fixture ready`)
      }
    }
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)

  await timeout(new Promise((resolveReady, reject) => {
    const poll = setInterval(() => {
      if (/dsh web: http:\/\/[^\s]+/.test(output)) {
        clearInterval(poll)
        resolveReady()
      }
    }, 100)
    poll.unref()
    child.once('error', reject)
    child.once('close', (code) => {
      clearInterval(poll)
      reject(new Error(`dsh exited before web readiness (code ${String(code)})`))
    })
  }), 90_000, 'dsh web readiness')
  console.log('mcp-offline-smoke: DSH web CLI is ready (hidden Node mode; no GUI)')

  await timeout(new Promise((resolveMcp, reject) => {
    const poll = setInterval(() => {
      if (reportedReady.has('engram') && reportedReady.has('free-search')) {
        clearInterval(poll)
        resolveMcp()
      }
    }, 100)
    poll.unref()
    child.once('error', reject)
    child.once('close', (code) => {
      clearInterval(poll)
      reject(new Error(`dsh exited before local MCP readiness (code ${String(code)})`))
    })
  }), 60_000, 'local MCP readiness')

  const readyMatch = /dsh web: (http:\/\/[^\s]+)/.exec(output)
  if (readyMatch?.[1] === undefined) throw new Error('dsh web did not print an authenticated URL')
  const auth = await timeout(fetch(readyMatch[1], { redirect: 'manual' }), 30_000, 'dsh web authentication')
  const cookie = auth.headers.get('set-cookie')?.split(';', 1)[0]
  if (auth.status !== 303 || cookie === undefined) {
    throw new Error(`dsh web authentication failed with HTTP ${String(auth.status)}`)
  }
  const origin = new URL(readyMatch[1]).origin
  const createSession = await timeout(fetch(`${origin}/api/session/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `mcp-offline-smoke-session-${process.pid}`,
      method: 'session/create',
      payload: { args: { request: {} } },
    }),
  }), 60_000, 'dsh session/create')
  if (!createSession.ok) throw new Error(`dsh session/create failed over HTTP ${String(createSession.status)}`)
  const sessionBody = await createSession.json()
  if (sessionBody?.result?.ok !== true || typeof sessionBody.result.value?.sessionId !== 'string') {
    throw new Error(`dsh session/create returned an invalid response: ${JSON.stringify(sessionBody)}`)
  }

  const sessionId = sessionBody.result.value.sessionId
  const prompt = await timeout(fetch(`${origin}/api/session/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `mcp-offline-smoke-prompt-${process.pid}`,
      method: 'session/prompt',
      payload: {
        args: {
          request: {
            requestId: `mcp-offline-smoke-request-${process.pid}`,
            sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: 'Call the offline MCP fixture once.' }],
          },
        },
      },
    }),
  }), 60_000, 'dsh session/prompt')
  if (!prompt.ok) throw new Error(`dsh session/prompt failed over HTTP ${String(prompt.status)}`)
  const promptBody = await prompt.json()
  if (promptBody?.result?.ok !== true) throw new Error(`dsh session/prompt returned an error: ${JSON.stringify(promptBody)}`)
  console.log('mcp-offline-smoke: scratch session accepted test prompt')

  await timeout(new Promise((resolveIntegration, reject) => {
    const poll = setInterval(() => {
      const toolNames = providerRequests.flatMap((request) => (
        Array.isArray(request.tools) ? request.tools : []
      )).map((tool) => tool?.name).filter((name) => typeof name === 'string')
      if (toolNames.includes('mcp__engram__smoke_status') && toolNames.includes(targetTool)) {
        clearInterval(poll)
        resolveIntegration()
      }
    }, 100)
    poll.unref()
    child.once('error', reject)
    child.once('close', (code) => {
      clearInterval(poll)
      reject(new Error(`dsh exited before the fixture tool result (code ${String(code)})`))
    })
  }), 60_000, 'provider MCP tool roster')

  const tools = providerRequests.flatMap((request) => (
    Array.isArray(request.tools) ? request.tools : []
  )).map((tool) => tool?.name).filter((name) => typeof name === 'string')
  for (const required of ['mcp__engram__smoke_status', targetTool]) {
    if (!tools.includes(required)) throw new Error(`dsh model request did not include ${required}: ${JSON.stringify(tools)}`)
  }
  console.log('mcp-offline-smoke: DSH registered both local fixtures with the loopback mock provider')
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  preserveScratchOnFailure = true
  const safeOutput = output.replace(/(dsh web: http:\/\/127\.0\.0\.1:[^\s?]+\?token=)[^\s]+/gi, '$1[redacted]')
  smokeError = new Error(`mcp-offline-smoke: ${detail}${child ? `\n${safeOutput}` : ''}`)
} finally {
  if (child?.pid !== undefined) {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
    if (typeof systemRoot !== 'string') {
      smokeError ??= new Error('mcp-offline-smoke: Windows SystemRoot unavailable for child cleanup')
    } else {
      const stopped = spawnSync(join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {
        env: smokeEnvironment,
        windowsHide: true,
        shell: false,
        stdio: 'ignore',
        timeout: 10_000,
      })
      if (stopped.error || stopped.status !== 0) {
        smokeError ??= new Error(`mcp-offline-smoke: could not stop its owned DSH CLI tree (status ${String(stopped.status)})`)
      }
      if (child.exitCode === null) {
        await Promise.race([
          new Promise((resolveClose) => child.once('close', resolveClose)),
          new Promise((resolveDelay) => setTimeout(resolveDelay, 10_000)),
        ])
      }
    }
  }
  provider.closeAllConnections()
  await new Promise((resolveClose) => provider.close(() => resolveClose()))
  if (preserveScratchOnFailure) {
    console.error(`mcp-offline-smoke: preserving test-only diagnostics at ${scratch}`)
  } else {
    try {
      cleanupScratch()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error(`mcp-offline-smoke: scratch cleanup failed; preserving test evidence at ${scratch}: ${detail}`)
      smokeError ??= error
    }
  }
}

if (smokeError !== undefined) throw smokeError
