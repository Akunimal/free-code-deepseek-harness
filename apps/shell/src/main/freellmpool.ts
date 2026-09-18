import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'

/**
 * Freellmpool proxy — manages a local `freellmpool proxy` process that
 * aggregates multiple free LLM providers behind one OpenAI-compatible
 * endpoint. Replaces the opencode2api worker pool + load balancer.
 *
 * https://github.com/0xzr/freellmpool
 */

export interface FreellmpoolConfig {
  /** Python executable path. Default: 'python' */
  pythonPath?: string
  /** Port to listen on. Default: 0 (OS picks free port) */
  port?: number
  /** Host to bind. Default: '127.0.0.1' */
  host?: string
  /** Proxy auth key. If set, clients must send Bearer token. */
  apiKey?: string
  /** Structured logger. */
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void
  /** Timeout for proxy readiness (ms). Default: 30000 */
  readyTimeoutMs?: number
}

export interface FreellmpoolInstance {
  url: string // http://127.0.0.1:<port>
  port: number
  pid: number
  stop(): Promise<void>
}

const DEFAULT_READY_TIMEOUT_MS = 30_000
const READY_POLL_MS = 500

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
        reject(new Error('freellmpool: no numeric address'))
        return
      }
      const port = addr.port
      server.close(() => resolve(port))
    })
  })
}

async function waitForReady(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/readyz`, {
        signal: AbortSignal.timeout(2_000),
      })
      if (res.ok || res.status === 503) {
        // 503 = proxy is up but no providers ready yet — still usable
        return true
      }
    } catch {
      // not ready yet
    }
    await sleep(READY_POLL_MS)
  }
  return false
}

/**
 * Start a local freellmpool proxy process.
 *
 * The proxy speaks the OpenAI API and pools multiple free LLM providers
 * with automatic failover, rate-limit handling, and keyless-start when
 * a keyless provider is available.
 */
export async function startFreellmpoolProxy(config: FreellmpoolConfig = {}): Promise<FreellmpoolInstance> {
  const pythonPath = config.pythonPath ?? 'python'
  const host = config.host ?? '127.0.0.1'
  const port = config.port ?? await findFreePort(host)
  const readyTimeoutMs = config.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  const log = config.log ?? (() => {})

  const args = ['-m', 'freellmpool', 'proxy', '--port', String(port), '--host', host]
  if (config.apiKey) {
    args.push('--api-key', config.apiKey)
  }

  log('info', 'starting freellmpool proxy', { pythonPath, port, host })

  let proc: ChildProcess
  try {
    proc = spawn(pythonPath, args, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Disable interactive prompts
        FREELLMPOOL_INTERACTIVE: '0',
      },
    })
  } catch (err) {
    throw new Error(`Failed to start freellmpool proxy: ${err instanceof Error ? err.message : String(err)}`)
  }

  const url = `http://${host}:${port}`

  proc.stdout?.on('data', (chunk: Buffer) => {
    log('debug', `freellmpool: ${chunk.toString().trimEnd()}`)
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    log('warn', `freellmpool stderr: ${chunk.toString().trimEnd()}`)
  })

  let exited = false
  let exitCode: number | null = null
  proc.on('exit', (code) => {
    exited = true
    exitCode = code
    log('warn', `freellmpool proxy exited code=${code}`)
  })
  proc.on('error', (err) => {
    exited = true
    log('error', 'freellmpool proxy error', { error: err.message })
  })

  // Wait for the proxy to be ready
  const ready = await waitForReady(url, readyTimeoutMs)
  if (!ready) {
    if (exited) {
      throw new Error(`freellmpool proxy exited during startup (code=${exitCode})`)
    }
    // Even if readiness check timed out, the proxy might still be usable
    log('warn', 'freellmpool proxy readiness check timed out; continuing anyway')
  }

  log('info', 'freellmpool proxy ready', { url, pid: proc.pid })

  return {
    url,
    port,
    pid: proc.pid ?? -1,
    stop: async () => {
      if (exited) return
      log('info', 'stopping freellmpool proxy')
      proc.kill('SIGTERM')
      // Wait up to 5s for graceful exit
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
