import type { ChildProcess } from 'node:child_process'
import { launchHidden } from './freecode-launcher.js'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { resolveOpencodeBinary } from './resource-paths.js'

/**
 * opencode2api sidecar — runs the bundled gateway as the single local
 * OpenAI-compatible endpoint, exposing OpenCode's anonymous Zen free lane
 * ("no auth").
 *
 * The upstream request contract (canonical `ses_` session headers,
 * `x-opencode-client`, anthropic-version/beta headers, agent-shaped streaming
 * bodies with the core toolset) lives inside the vendored binary, so the
 * headers this app sends upstream are exactly the ones opencode2api's logic
 * produces. Locally the gateway authenticates with `server_keys` via
 * `Authorization: Bearer <key>` (or `x-api-key`), same as the free pool
 * route's `FREECODE_PUBLIC_KEY`.
 */

export interface Opencode2apiConfig {
  /** Resources root containing `opencode2api/` binaries. */
  resourcesDir: string
  /** Directory where the generated config.json is persisted. */
  userDataDir: string
  /** Local API key the gateway accepts (`server_keys`). */
  apiKey: string
  /** Optional egress proxies passed to opencode2api (e.g. ['direct', 'socks5://127.0.0.1:9050']). */
  proxies?: string[]
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
  /** Absolute path of the proxyfile the gateway reads at (re)start. */
  proxyfilePath: string
  /** Restart on the SAME port so the gateway reloads a refreshed proxyfile
   *  without changing the URL the shell already handed to the harness. */
  restart(): Promise<void>
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
/**
 * The gateway refuses to start when its proxyfile is missing. The rotator only
 * writes it after a harvest, so create an empty file (no proxies: direct only)
 * when absent. An existing file is never overwritten.
 */
export function ensureProxyfile(path: string): void {
  if (existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '', 'utf8')
}

function buildConfig(port: number, apiKey: string, proxyfile: string, proxies: string[] = ['direct']): string {
  return JSON.stringify(
    {
      listen: `127.0.0.1:${port}`,
      server_keys: [apiKey],
      zen_keys: [],
      go_keys: [],
      anonymous: true,
      prefer: 'zen',
      // Direct is always first: the pool cursor starts at index 0 and only
      // advances to a proxyfile entry when a direct attempt returns non-2xx.
      proxies,
      proxyfile,
      upstream: {
        zen: 'https://opencode.ai/zen',
        anonymous: 'https://opencode.ai/inference',
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

  // The port is fixed for the session so a restart (to reload a refreshed
  // proxyfile) keeps the URL the shell already handed to the harness.
  const port = await findFreePort(host)
  const url = `http://${host}:${port}`
  const configDir = join(config.userDataDir, 'opencode2api')
  const configPath = join(configDir, 'config.json')
  const proxyfilePath = join(configDir, 'proxies.txt')

  let proc: ChildProcess | undefined
  let exited = true
  let shuttingDown = false
  let restarting = false

  const writeConfig = (): boolean => {
    try {
      mkdirSync(configDir, { recursive: true })
      ensureProxyfile(proxyfilePath)
      writeFileSync(configPath, buildConfig(port, config.apiKey, proxyfilePath, config.proxies), 'utf8')
      return true
    } catch (error) {
      log('warn', 'opencode2api config write failed; no-auth lane disabled', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  const spawn = async (): Promise<boolean> => {
    exited = false
    try {
      proc = launchHidden({
        executable: binary, args: ['-config', configPath, '-listen', `${host}:${port}`],
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: configDir,
      }).proc
    } catch (error) {
      exited = true
      log('warn', 'opencode2api failed to spawn', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
    const child = proc
    child.on('exit', (code) => {
      exited = true
      if (!shuttingDown && !restarting) log('warn', `opencode2api exited code=${code}`)
    })
    child.on('error', (error) => {
      exited = true
      log('error', 'opencode2api process error', { error: error.message })
    })
    child.stdout?.on('data', (chunk: Buffer) => log('debug', `opencode2api: ${chunk.toString().trimEnd()}`))
    child.stderr?.on('data', (chunk: Buffer) => log('warn', `opencode2api stderr: ${chunk.toString().trimEnd()}`))
    const ready = await waitForHealth(url, readyTimeoutMs, () => !exited)
    // Alive-but-slow is kept: the catalog may finish loading later.
    return ready || !exited
  }

  const killCurrent = async (): Promise<void> => {
    const child = proc
    if (!child || exited) return
    child.kill('SIGTERM')
    const killDeadline = Date.now() + 5_000
    while (!exited && Date.now() < killDeadline) await sleep(100)
    if (!exited) child.kill('SIGKILL')
    await sleep(200) // let the OS release the fixed port before a respawn
  }

  if (!writeConfig()) return undefined
  log('info', 'starting opencode2api', { binary, port, anonymous: true })
  if (!(await spawn())) {
    log('error', 'opencode2api not healthy at startup; no-auth lane disabled')
    return undefined
  }
  log('info', 'opencode2api ready', { url, pid: proc?.pid })

  return {
    url,
    port,
    pid: proc?.pid ?? -1,
    apiKey: config.apiKey,
    proxyfilePath,
    restart: async () => {
      if (shuttingDown || restarting) return
      restarting = true
      try {
        log('info', 'restarting opencode2api to reload proxyfile')
        await killCurrent()
        writeConfig()
        // The fixed port may still be in TIME_WAIT after the kill; retry the
        // respawn a few times so a restart never leaves the lane down.
        let up = false
        for (let attempt = 0; attempt < 3 && !up; attempt++) {
          if (attempt > 0) await sleep(500)
          up = await spawn()
        }
        log(up ? 'info' : 'warn', up ? 'opencode2api restarted' : 'opencode2api restart did not become healthy')
      } finally {
        restarting = false
      }
    },
    stop: async () => {
      shuttingDown = true
      await killCurrent()
    },
  }
}
