import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { killProcessTree, launchHidden } from './freecode-launcher.js'

const STABLE_UPTIME_MS = 60_000
const STOP_GRACE_MS = 5_000

export interface SearxngSidecarOptions {
  runtimeDir: string
  settingsPath: string
  tempDir: string
  port: number
  log?: (level: string, msg: string, meta?: Record<string, unknown>) => void
  launch?: typeof launchHidden
  kill?: typeof killProcessTree
  backoffBaseMs?: number
  restartBudget?: number
}

/** Owns the embedded SearXNG child. Failure never blocks or crashes the shell. */
export class SearxngSidecar {
  private proc: ChildProcess | null = null
  private stopping = false
  private restarts = 0
  private startedAt = 0
  private timer: NodeJS.Timeout | null = null
  /** Regenerated on each launch; never written to disk or logged. */
  private secret = ''

  constructor(private readonly options: SearxngSidecarOptions) {}

  get pid(): number | null { return this.proc?.pid ?? null }

  start(): void {
    this.stopping = false
    if (this.proc === null) this.spawn()
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null }
    const proc = this.proc
    this.proc = null
    if (proc === null || proc.exitCode !== null || proc.pid === undefined) return
    const kill = this.options.kill ?? killProcessTree
    kill(proc.pid)
    await new Promise<void>((resolve) => {
      const done = setTimeout(resolve, STOP_GRACE_MS)
      done.unref()
      proc.once('exit', () => { clearTimeout(done); resolve() })
    })
  }

  private spawn(): void {
    const { runtimeDir, settingsPath, tempDir, port, log } = this.options
    const launch = this.options.launch ?? launchHidden
    this.secret = randomBytes(32).toString('hex')
    this.startedAt = Date.now()
    let proc: ChildProcess
    try {
      ({ proc } = launch({
        executable: join(runtimeDir, 'python', 'python.exe'),
        args: ['-m', 'granian', '--interface', 'wsgi', '--host', '127.0.0.1', '--port', String(port), '--workers', '1', 'searx.webapp:app'],
        cwd: join(runtimeDir, 'app'),
        env: {
          SYSTEMROOT: process.env['SYSTEMROOT'],
          TEMP: tempDir,
          TMP: tempDir,
          SEARXNG_SETTINGS_PATH: settingsPath,
          SEARXNG_SECRET: this.secret,
          PYTHONUTF8: '1',
          PYTHONDONTWRITEBYTECODE: '1',
        },
        requestId: 'searxng',
        closeReason: 'searxng-exit',
      }))
    } catch (error) {
      log?.('warn', 'searxng launch failed', { error: String(error) })
      return
    }
    this.proc = proc
    proc.stdout?.resume()
    proc.stderr?.on('data', (chunk: Buffer) => log?.('debug', `searxng: ${chunk.toString().trimEnd().slice(0, 1_024)}`))
    proc.once('error', error => log?.('warn', 'searxng process error', { error: String(error) }))
    proc.once('exit', (code) => {
      if (this.stopping || this.proc !== proc) return
      this.proc = null
      if (Date.now() - this.startedAt >= STABLE_UPTIME_MS) this.restarts = 0
      if (this.restarts >= (this.options.restartBudget ?? 3)) {
        log?.('warn', 'searxng gave up after restarts', { code })
        return
      }
      this.restarts += 1
      const delay = (this.options.backoffBaseMs ?? 1_000) * 2 ** (this.restarts - 1)
      log?.('warn', 'searxng exited, restarting', { code, delay })
      this.timer = setTimeout(() => { this.timer = null; if (!this.stopping) this.spawn() }, delay)
      this.timer.unref()
    })
  }
}
