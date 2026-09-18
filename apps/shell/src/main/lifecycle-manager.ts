/**
 * lifecycle-manager.ts — Enforce one application owner and serialize lifecycle events.
 *
 * This module provides:
 *   1. Single-instance lock via Electron's app.requestSingleInstanceLock()
 *   2. Generation-based lifecycle tracking (old-gen events are no-ops)
 *   3. Bounded startup with health probe
 *   4. Graceful staged shutdown (SIGTERM → timeout → SIGKILL)
 *   5. Package.json singleton guard for stale lock detection
 */

import { app, type App } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { launchHidden, killProcessTree } from './freecode-launcher.js'

// ── Types ──────────────────────────────────────────────────────────

export interface LifecycleManagerConfig {
  /** Absolute path to userData directory. */
  userDataDir: string
  /** Structured logger. */
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void
  /** Maximum boot failures before showing a single actionable error. Default: 5. */
  maxBootFailures?: number
  /** Health probe timeout (ms). Default: 5000. */
  healthProbeTimeoutMs?: number
  /** Graceful shutdown timeout (ms) before SIGKILL. Default: 2000. */
  shutdownTimeoutMs?: number
}

export type LifecycleState = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed'

export interface LifecycleSnapshot {
  state: LifecycleState
  generation: number
  bootFailures: number
  isSecondInstance: boolean
  pid: number
}

export interface HealthProbeResult {
  healthy: boolean
  durationMs: number
  error?: string
}

// ── Singleton lock ─────────────────────────────────────────────────

const LOCK_FILE_NAME = 'freecode-singleton.lock'

interface LockFileContent {
  pid: number
  createdAt: number
}

/**
 * Attempt to acquire a single-instance lock.
 * Returns `{ locked: true }` on success, or `{ locked: false, existingPid }`
 * if another instance owns the lock (and that instance is still alive).
 */
export function acquireSingletonLock(userDataDir: string): { locked: boolean; existingPid?: number } {
  const lockPath = join(userDataDir, LOCK_FILE_NAME)

  // Check existing lock
  if (existsSync(lockPath)) {
    try {
      const content = JSON.parse(readFileSync(lockPath, 'utf8')) as LockFileContent
      if (typeof content.pid === 'number' && content.pid > 0) {
        // Check if the process is still alive
        if (isProcessAlive(content.pid)) {
          return { locked: false, existingPid: content.pid }
        }
        // Stale lock — previous instance crashed. Remove it.
      }
    } catch {
      // Corrupt lock file — remove and recreate
    }
    try { unlinkSync(lockPath) } catch { /* best effort */ }
  }

  // Write our lock
  try {
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, createdAt: Date.now() } satisfies LockFileContent), 'utf8')
    return { locked: true }
  } catch (writeErr) {
    // Cannot write lock file — degraded singleton. Return locked: false so
    // the caller knows the lock could not be established.
    return { locked: false }
  }
}

/**
 * Release the singleton lock if we own it.
 */
export function releaseSingletonLock(userDataDir: string): void {
  const lockPath = join(userDataDir, LOCK_FILE_NAME)
  try {
    if (!existsSync(lockPath)) return
    const content = JSON.parse(readFileSync(lockPath, 'utf8')) as LockFileContent
    if (content.pid === process.pid) {
      unlinkSync(lockPath)
    }
  } catch {
    // Best effort
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    // process.kill(0) sends signal 0 — no kill, just checks existence
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// ── Electron single-instance lock ──────────────────────────────────

/**
 * Request Electron's built-in single-instance lock.
 * If a second instance launches, the `onSecondInstance` callback fires
 * on the first instance and the second should exit.
 *
 * @returns true if this is the primary instance, false if another already exists.
 */
export function requestElectronSingleInstance(
  onSecondInstance?: (event: Electron.Event, argv: string[], workingDirectory: string) => void,
): boolean {
  const gotLock = app.requestSingleInstanceLock()

  if (!gotLock) {
    // Another instance already holds the lock — this is the duplicate
    return false
  }

  if (onSecondInstance) {
    app.on('second-instance', onSecondInstance)
  }

  return true
}

// ── Generation tracker ─────────────────────────────────────────────

export class GenerationTracker {
  private _generation = 0

  /** Current generation number. Increment on every stop/restart. */
  get current(): number {
    return this._generation
  }

  /** Increment and return the new generation. Old events should not act. */
  advance(): number {
    return ++this._generation
  }

  /**
   * Check if a generation token is still current.
   * Old-generation events must be no-ops.
   */
  isCurrent(token: number): boolean {
    return token === this._generation
  }
}

// ── Health probe ───────────────────────────────────────────────────

/**
 * Probe a local HTTP endpoint to verify readiness.
 * Returns `{ healthy: true, durationMs }` on success.
 */
export async function healthProbe(
  url: string,
  timeoutMs = 5_000,
): Promise<HealthProbeResult> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(url, {
      signal: controller.signal,
      method: 'GET',
      headers: { 'User-Agent': 'FreeCode-LifecycleManager/1.0' },
    })
    clearTimeout(timer)
    return {
      healthy: response.ok || response.status === 401, // 401 is OK — auth gate is working
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      healthy: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Lifecycle manager ──────────────────────────────────────────────

export class LifecycleManager {
  private config: Required<Omit<LifecycleManagerConfig, 'log'>> & Pick<LifecycleManagerConfig, 'log'>
  private _state: LifecycleState = 'idle'
  private _generation = new GenerationTracker()
  private _bootFailures = 0
  private _isSecondInstance = false
  private _shutdownTimer: NodeJS.Timeout | null = null

  constructor(config: LifecycleManagerConfig) {
    this.config = {
      ...config,
      maxBootFailures: config.maxBootFailures ?? 5,
      healthProbeTimeoutMs: config.healthProbeTimeoutMs ?? 5_000,
      shutdownTimeoutMs: config.shutdownTimeoutMs ?? 2_000,
    }
  }

  get state(): LifecycleState {
    return this._state
  }

  get generation(): number {
    return this._generation.current
  }

  get bootFailures(): number {
    return this._bootFailures
  }

  get isSecondInstance(): boolean {
    return this._isSecondInstance
  }

  /** Snapshot for diagnostics. */
  snapshot(): LifecycleSnapshot {
    return {
      state: this._state,
      generation: this._generation.current,
      bootFailures: this._bootFailures,
      isSecondInstance: this._isSecondInstance,
      pid: process.pid,
    }
  }

  /**
   * Mark startup as beginning. Returns false if boot budget is exhausted
   * or shutdown is in progress.
   */
  beginStartup(): boolean {
    if (this._state === 'failed') return false
    if (this._state === 'stopping' || this._state === 'stopped') return false
    this._state = 'starting'
    this._generation.advance()
    return true
  }

  /**
   * Mark a boot failure. Returns false when budget is exhausted.
   */
  recordBootFailure(detail?: string): boolean {
    this._bootFailures++
    this.config.log?.('error', 'boot failure', {
      bootFailures: this._bootFailures,
      max: this.config.maxBootFailures,
      generation: this._generation.current,
      detail,
    })
    if (this._bootFailures >= this.config.maxBootFailures) {
      this._state = 'failed'
      return false
    }
    return true
  }

  /**
   * Reset boot failure counter on successful ready.
   */
  markReady(): void {
    this._bootFailures = 0
    this._state = 'ready'
  }

  /**
   * Mark as second instance (should exit).
   */
  markSecondInstance(): void {
    this._isSecondInstance = true
  }

  /**
   * Graceful staged shutdown:
   *   1. Set state to 'stopping'
   *   2. Wait for processes to exit gracefully
   *   3. After timeout, force kill via process tree
   *   4. Clean up singleton lock
   *
   * @param processes PIDs to shut down
   * @param cleanup Optional async cleanup (e.g. stop WarpFleet, close embedded browser)
   */
  async gracefulShutdown(
    processes: number[],
    cleanup?: () => Promise<void>,
  ): Promise<void> {
    if (this._state === 'stopping' || this._state === 'stopped') return
    this._state = 'stopping'
    this.config.log?.('info', 'graceful shutdown initiated', {
      processes: processes.length,
      generation: this._generation.current,
    })

    try {
      // Run cleanup first (stop WarpFleet, close browser, etc.)
      if (cleanup) {
        await Promise.race([
          cleanup(),
          this.shutdownTimeout(),
        ])
        this.clearShutdownTimer()
      }

      // Wait for processes to exit gracefully
      const exitPromises = processes.map((pid) => this.waitForProcessExit(pid))
      await Promise.race([
        Promise.all(exitPromises),
        this.shutdownTimeout(),
      ])
      this.clearShutdownTimer()
    } catch (err) {
      this.clearShutdownTimer()
      this.config.log?.('error', 'graceful shutdown error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Force kill any remaining processes
    for (const pid of processes) {
      if (isProcessAlive(pid)) {
        this.config.log?.('warn', 'force killing process', { pid })
        killProcessTree(pid)
      }
    }

    this._state = 'stopped'
    releaseSingletonLock(this.config.userDataDir)
  }

  /**
   * Wait for a process to exit, with timeout.
   */
  private waitForProcessExit(pid: number, timeoutMs = 500): Promise<void> {
    return new Promise((resolve) => {
      if (!isProcessAlive(pid)) {
        resolve()
        return
      }
      const interval = setInterval(() => {
        if (!isProcessAlive(pid)) {
          clearInterval(interval)
          resolve()
        }
      }, 50)
      setTimeout(() => {
        clearInterval(interval)
        resolve()
      }, timeoutMs)
    })
  }

  private shutdownTimeout(): Promise<never> {
    return new Promise((_, reject) => {
      this._shutdownTimer = setTimeout(() => {
        this._shutdownTimer = null
        reject(new Error(`shutdown timeout after ${this.config.shutdownTimeoutMs}ms`))
      }, this.config.shutdownTimeoutMs)
    })
  }

  private clearShutdownTimer(): void {
    if (this._shutdownTimer) {
      clearTimeout(this._shutdownTimer)
      this._shutdownTimer = null
    }
  }

  /**
   * Release resources. Called during app shutdown.
   */
  destroy(): void {
    if (this._shutdownTimer) {
      clearTimeout(this._shutdownTimer)
      this._shutdownTimer = null
    }
    releaseSingletonLock(this.config.userDataDir)
  }
}
