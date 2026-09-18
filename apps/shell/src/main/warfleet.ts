import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface WarpFleetStatus {
  active: boolean
  rotating: boolean
  cooldownMs: number
  lastError: string | null
}

interface WarpFleetConfig {
  warpCliPath?: string
  serviceName?: string
  cooldownMs?: number
}

const DEFAULT_WARP_CLI = 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe'
const DEFAULT_SERVICE = 'CloudflareWARP'
const DEFAULT_COOLDOWN_MS = 60_000

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function runCommand(
  command: string,
  args: string[],
  { timeoutMs = 15_000 } = {},
): Promise<{ stdout: string; stderr: string; code: number | null; error?: Error; timedOut?: boolean }> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    let child: ChildProcess

    const finish = (result: { code: number | null; signal?: string | null; error?: Error; timedOut?: boolean }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, ...result })
    }

    try {
      child = spawn(command, args, {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({ code: null, error: error as Error })
      return
    }

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })
    timer = setTimeout(() => {
      try { child.kill() } catch { /* already exited */ }
      finish({ code: null, timedOut: true })
    }, timeoutMs)
    child.once('error', (error) => finish({ code: null, error }))
    child.once('exit', (code, signal) => finish({ code, signal }))
  })
}

async function exec(command: string, args: string[], options?: { timeoutMs?: number }): Promise<string> {
  const result = await runCommand(command, args, options)
  if (result.error) throw result.error
  if (result.timedOut) throw new Error(`${command} timed out after ${options?.timeoutMs}ms`)
  if (result.code !== 0) {
    const details = result.stderr.trim() || result.stdout.trim()
    throw new Error(`${command} exited ${result.code}: ${details}`)
  }
  return result.stdout.trim()
}

/**
 * Manages the machine-wide Cloudflare WARP tunnel as the only fallback route.
 * Flow: direct → WARP on 429 → rotate WARP IP on continued 429 →
 *       disconnect + restart WARP service + reconnect as last resort.
 *
 * Unlike Tor (SOCKS5 per-worker), WARP operates at the OS network layer —
 * no per-worker proxy configuration is needed.
 */
export class WarpFleet {
  private warpCliPath: string
  private serviceName: string
  private cooldownMs: number
  private _warpActive = false
  private _rotating = false
  private _lastError: string | null = null
  private _opLock: Promise<void> | null = null
  private _changeListeners = new Set<() => void>()

  constructor(config: WarpFleetConfig = {}) {
    this.warpCliPath = config.warpCliPath ?? DEFAULT_WARP_CLI
    this.serviceName = config.serviceName ?? DEFAULT_SERVICE
    this.cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS
  }

  get warpActive(): boolean { return this._warpActive }
  get rotating(): boolean { return this._rotating }
  get lastError(): string | null { return this._lastError }

  onChange(cb: () => void): () => void {
    this._changeListeners.add(cb)
    return () => this._changeListeners.delete(cb)
  }

  private emitChange(): void {
    for (const cb of this._changeListeners) cb()
  }

  private async _locked<T>(fn: () => Promise<T>): Promise<T> {
    while (this._opLock) await this._opLock
    let release: () => void
    this._opLock = new Promise<void>((resolve) => { release = resolve })
    try {
      return await fn()
    } finally {
      this._opLock = null
      release!()
    }
  }

  async enable(): Promise<boolean> {
    return this._locked(async () => {
      if (this._warpActive && await this._checkConnected()) return true
      const ok = await this._ensureConnected('enable')
      this._warpActive = ok
      this.emitChange()
      return ok
    })
  }

  async disable(): Promise<boolean> {
    return this._locked(async () => {
      try {
        await this._exec(['disconnect'], 10_000)
      } catch { /* already disconnected is fine */ }
      this._warpActive = false
      this._rotating = false
      this.emitChange()
      console.log('[warfleet] disconnected')
      return true
    })
  }

  async rotateIP(): Promise<boolean> {
    if (this._rotating) return this._warpActive
    this._rotating = true
    try {
      return await this._locked(async () => {
        const ok = await this._ensureConnected('rotate')
        this._warpActive = ok
        if (ok) console.log('[warfleet] WARP IP rotated')
        this.emitChange()
        return ok
      })
    } finally {
      this._rotating = false
    }
  }

  async isConnected(): Promise<boolean> {
    try { return await this._checkConnected() }
    catch { return false }
  }

  status(): WarpFleetStatus {
    return {
      active: this._warpActive,
      rotating: this._rotating,
      cooldownMs: this.cooldownMs,
      lastError: this._lastError,
    }
  }

  isAvailable(): boolean {
    return existsSync(this.warpCliPath)
  }

  private async _exec(args: string[], timeoutMs?: number): Promise<string> {
    return exec(this.warpCliPath, args, { timeoutMs })
  }

  private async _checkConnected(): Promise<boolean> {
    try {
      const output = await this._exec(['status'], 5_000)
      return /Status update:\s*Connected/i.test(output)
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  private async _connectAttempts(label: string, count = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= count; attempt++) {
      try {
        await this._exec(['connect'], 20_000)
        await sleep(3_000)
        if (await this._checkConnected()) {
          this._lastError = null
          console.log(`[warfleet] connected to WARP (${label})`)
          return true
        }
      } catch (error) {
        this._lastError = error instanceof Error ? error.message : String(error)
        console.warn(`[warfleet] ${label} attempt ${attempt}/${count} failed: ${this._lastError}`)
      }
      if (attempt < count) await sleep(2_000)
    }
    return false
  }

  /**
   * Ensure WARP is connected: disconnect first (clean state), then connect.
   * If connection fails, restart the Windows service and retry.
   */
  private async _ensureConnected(label: string): Promise<boolean> {
    // Clean disconnect first
    try { await this._exec(['disconnect'], 10_000) } catch { /* ok */ }
    await sleep(1_000)

    // Try connecting directly
    if (await this._connectAttempts(label, 3)) return true

    // Connection failed — restart the WARP service and retry
    console.warn(`[warfleet] restarting service ${this.serviceName}`)
    if (!(await this._restartService())) {
      this._lastError = 'Cloudflare WARP service restart failed'
      return false
    }
    await sleep(2_000)

    // Fresh service may already be connected; disconnect to get clean state
    try { await this._exec(['disconnect'], 10_000) } catch { /* ok */ }
    await sleep(1_000)

    const ok = await this._connectAttempts(`${label} after service restart`, 3)
    if (!ok) this._lastError = 'WARP connection failed after service restart'
    return ok
  }

  private async _restartService(): Promise<boolean> {
    if (!this.serviceName) return false
    const stop = await runCommand('sc.exe', ['stop', this.serviceName], { timeoutMs: 20_000 })
    if (stop.error || stop.timedOut) return false
    await sleep(1_500)
    const start = await runCommand('sc.exe', ['start', this.serviceName], { timeoutMs: 20_000 })
    if (start.error || start.timedOut) return false
    // 0 = started; 1056 = already running
    return start.code === 0 || start.code === 1056
  }
}

const STATE_FILE = 'warfleet-state.json'

export interface WarpFleetState {
  enabled: boolean
}

export function loadWarpFleetState(userDataDir: string): WarpFleetState {
  const p = join(userDataDir, STATE_FILE)
  try {
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, 'utf8'))
      return { enabled: !!data.enabled }
    }
  } catch { /* */ }
  return { enabled: false }
}

export function saveWarpFleetState(userDataDir: string, state: WarpFleetState): void {
  writeFileSync(join(userDataDir, STATE_FILE), JSON.stringify(state), 'utf8')
}
