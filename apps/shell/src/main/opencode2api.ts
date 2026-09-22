import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { resolveOpencodeBinary } from './resource-paths.js'

/**
 * opencode2api sidecar — runs the bundled v1.3.2 gateway as a second local
 * OpenAI-compatible endpoint next to freellmpool, exposing OpenCode's
 * anonymous Zen free lane ("no auth").
 *
 * The upstream request contract (canonical `ses_` session headers,
 * `x-opencode-client`, anthropic-version/beta headers, agent-shaped streaming
 * bodies with the core toolset) lives inside the vendored binary, so the
 * headers this app sends upstream are exactly the ones opencode2api's logic
 * produces. Locally the gateway authenticates with `server_keys` via
 * `Authorization: Bearer <key>` (or `x-api-key`), same as the FreeLLMPool
 * route's `FREECODE_PUBLIC_KEY`.
 */

export interface Opencode2apiConfig {
  /** Resources root containing `opencode2api/` binaries. */
  resourcesDir: string
  /** Directory where the generated config.json is persisted. */
  userDataDir: string
  /** Local API key the gateway accepts (`server_keys`). */
  apiKey: string
  platform?: NodeJS.Platform
  arch?: NodeJS.Architecture
  /** Structured logger. */
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void
  /** Timeout for the health endpoint to answer (ms). Default 10000. */
  readyTimeoutMs?: number
}

export interface Opencode2apiInstance {
  url: string // http://127.0.0.1:<port>
  port: number
  pid: number
  /** Key the gateway was started with (server_keys[0]). */
  apiKey: string
  stop(): Promise<void>
}

const DEFAULT_READY_TIMEOUT_MS = 10_000
const READY_POLL_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function findFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, host, () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        server.close()
        reject(new Error('opencode2api: no numeric address'))
        return
      }
      const port = addr.port
      server.close(() => resolve(port))
    })
  })
}

/** Mirror of the anonymous Zen runtime config (E:\AgentZeroPhoenix layout):
 *  no upstream keys, anonymous lane on, loopback only, WebUI disabled. */
function buildConfig(port: number, apiKey: string): string {
  return JSON.stringify(
    {
      listen: `127.0.0.1:${port}`,
      server_keys: [apiKey],
      zen_keys: [],
      go_keys: [],
      anonymous: true,
      prefer: 'zen',
      proxies: ['direct'],
      proxyfile: '',
      upstream: {
        zen: 'https://opencode.ai/zen',
        go: 'https://opencode.ai/zen/go',
      },
      retry: { max_attempts: 3, timeout_seconds: 300 },
      models: { refresh_seconds: 300, protocols: {} },
      performance: {
        max_idle_conns: 2048,
        max_idle_conns_per_host: 256,
        max_conns_per_host: 0,
        idle_conn_timeout_seconds: 120,
        connect_timeout_seconds: 5,
        failure_cooldown_seconds: 15,
        attempt_timeout_seconds: 0,
      },
      logging: { level: 'info', ring_size: 2000, dump_request_bodies: false },
      webui: { enabled: false, listen: '127.0.0.1:0', username: 'local', session_ttl_minutes: 720 },
    },
    null,
    2,
  )
}

/** Wait until GET /healthz answers at all (any status). 503 = booting with
 *  the model catalog still pending — the process is serving either way. */
async function waitForHealth(url: string, timeoutMs: number, isAlive: () => boolean): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive()) return false
    try {
      const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2_000) })
      // Any HTTP answer means the listener is up; body/status do not matter.
      if (res.status > 0) return true
    } catch {
      // not listening yet
    }
    await sleep(READY_POLL_MS)
  }
  return false
}

/**
 * Start the bundled opencode2api gateway (anonymous Zen lane).
 *
 * Returns `undefined` when the platform binary is absent or startup fails —
 * the lane is optional and must never block the desktop runtime.
 */
export async function startOpencode2api(
  config: Opencode2apiConfig,
): Promise<Opencode2apiInstance | undefined> {
  const log = config.log ?? (() => {})
  const platform = config.platform ?? process.platform
  const arch = config.arch ?? process.arch
  const host = '127.0.0.1'
  const readyTimeoutMs = config.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  const binary = resolveOpencodeBinary(config.resourcesDir, platform, arch)

  if (!existsSync(binary)) {
    log('warn', 'opencode2api binary missing; no-auth lane disabled', { binary })
    return undefined
  }

  const port = await findFreePort(host)
  const url = `http://${host}:${port}`
  const configDir = join(config.userDataDir, 'opencode2api')
  const configPath = join(configDir, 'config.json')

  try {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(configPath, buildConfig(port, config.apiKey), 'utf8')
  } catch (error) {
    log('warn', 'opencode2api config write failed; no-auth lane disabled', {
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }

  log('info', 'starting opencode2api', { binary, port, anonymous: true })

  let proc: ChildProcess
  try {
    proc = spawn(binary, ['-config', configPath, '-listen', `${host}:${port}`], {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: configDir,
    })
  } catch (error) {
    log('warn', 'opencode2api failed to spawn', {
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }

  let exited = false
  let exitCode: number | null = null
  proc.on('exit', (code) => {
    exited = true
    exitCode = code
    log('warn', `opencode2api exited code=${code}`)
  })
  proc.on('error', (error) => {
    exited = true
    log('error', 'opencode2api process error', { error: error.message })
  })
  proc.stdout?.on('data', (chunk: Buffer) => {
    log('debug', `opencode2api: ${chunk.toString().trimEnd()}`)
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    log('warn', `opencode2api stderr: ${chunk.toString().trimEnd()}`)
  })

  const ready = await waitForHealth(url, readyTimeoutMs, () => !exited)
  if (!ready) {
    const reason = exited ? `exited code=${exitCode}` : 'health check timed out'
    log(exited ? 'error' : 'warn', `opencode2api not healthy (${reason}); no-auth lane disabled`)
    if (!exited) {
      // Still alive: keep it — the model catalog may finish loading later and
      // the refresher treats an empty list as a soft, retried miss.
      log('info', 'opencode2api continuing despite slow health', { url })
    } else {
      return undefined
    }
  } else {
    log('info', 'opencode2api ready', { url, pid: proc.pid })
  }

  return {
    url,
    port,
    pid: proc.pid ?? -1,
    apiKey: config.apiKey,
    stop: async () => {
      if (exited) return
      log('info', 'stopping opencode2api')
      proc.kill('SIGTERM')
      const killDeadline = Date.now() + 5_000
      while (!exited && Date.now() < killDeadline) {
        await sleep(100)
      }
      if (!exited) {
        proc.kill('SIGKILL')
      }
    },
  }
}
