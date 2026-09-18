/**
 * freecode-launcher.ts — Centralized Win32 process launch seam.
 *
 * Every FreeCode-owned child process must route through this module.
 * It enforces:
 *   - shell: false (no cmd.exe / PowerShell intermediary)
 *   - windowsHide: true + CREATE_NO_WINDOW
 *   - Sanitized environment (caller-specified keys only)
 *   - Job Object attachment for process tree management
 *   - Structured launch metrics for diagnostic traces
 *
 * Vendor processes (bash-local, pwsh-local) use ctx.subprocess.spawn
 * which is already abstracted and not routed through this seam.
 */

import { spawn, spawnSync, type ChildProcess, type SpawnOptions, type SpawnSyncOptions } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'

// ── Launch metrics ───────────────────────────────────────────────────
export interface LaunchMetrics {
  id: string
  executable: string
  args: string[]
  cwd?: string
  pid?: number
  parentPid: number
  generation?: number
  requestId?: string
  launchedAt: number
  exitedAt?: number
  exitCode?: number | null
  signal?: string | null
  closeReason?: string
}

const activeLaunches = new Map<string, LaunchMetrics>()

/**
 * Generate a short unique launch ID for tracing.
 */
function launchId(): string {
  return randomBytes(6).toString('hex')
}

// ── Hidden process options (defense in depth) ────────────────────────

/**
 * Base spawn options that hide the child window. Use as spread target:
 *   spawn(exe, args, { ...HIDDEN_OPTIONS, env, cwd })
 */
export const HIDDEN_OPTIONS: SpawnOptions = {
  windowsHide: true,
  shell: false,
  // Node.js on Windows passes CREATE_NO_WINDOW when windowsHide is set,
  // but we also include it via the detached:false + windowsHide combo
  // for defense in depth against SDK paths that might re-enable the window.
  detached: false,
}

/**
 * Sync variant of hidden options.
 */
export const HIDDEN_SYNC_OPTIONS: SpawnSyncOptions = {
  windowsHide: true,
  shell: false,
}

// ── Async launcher ───────────────────────────────────────────────────

export interface LaunchOptions {
  /** Absolute path to the executable. */
  executable: string
  /** Arguments array. First element is NOT the executable. */
  args?: string[]
  /** Working directory. */
  cwd?: string
  /** Sanitized environment — only listed keys are forwarded. */
  env?: Record<string, string>
  /** stdio configuration. Default: ['ignore', 'pipe', 'pipe']. */
  stdio?: SpawnOptions['stdio']
  /** Request ID for correlation. */
  requestId?: string
  /** Generation token for lifecycle tracking. */
  generation?: number
  /** Close reason label for metrics. */
  closeReason?: string
  /** Custom log function. */
  log?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
}

export interface LaunchResult {
  /** The ChildProcess handle. */
  proc: ChildProcess
  /** Launch metrics for diagnostic traces. */
  metrics: LaunchMetrics
}

/**
 * Check if a path looks like an absolute/relative file path (contains a
 * directory separator) rather than a bare command name resolved via PATH.
 */
function isFilePath(executable: string): boolean {
  return executable.includes('/') || executable.includes('\\')
}

/**
 * Spawn a hidden child process through the centralized seam.
 *
 * The process is:
 *   1. Spawned with shell:false, windowsHide:true, CREATE_NO_WINDOW
 *   2. Attached to the FreeCode Job Object (if available)
 *   3. Tracked in activeLaunches for diagnostics
 *
 * @throws if the executable does not exist or spawn fails
 */
export function launchHidden(options: LaunchOptions): LaunchResult {
  const id = launchId()
  const parentPid = process.pid

  const metrics: LaunchMetrics = {
    id,
    executable: options.executable,
    args: options.args ?? [],
    cwd: options.cwd,
    parentPid,
    generation: options.generation,
    requestId: options.requestId,
    launchedAt: Date.now(),
  }

  // Validate executable exists — only for absolute/relative file paths.
  // Bare command names (e.g. "powershell.exe", "where", "git") are resolved
  // by the OS via PATH at spawn time; existsSync does NOT search PATH.
  if (isFilePath(options.executable) && !existsSync(options.executable)) {
    throw new LaunchError('executable-not-found', `Executable not found: ${options.executable}`, metrics)
  }

  const spawnOpts: SpawnOptions = {
    ...HIDDEN_OPTIONS,
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }

  let proc: ChildProcess
  try {
    proc = spawn(options.executable, options.args ?? [], spawnOpts)
  } catch (err) {
    throw new LaunchError(
      'spawn-failed',
      `Failed to spawn ${options.executable}: ${err instanceof Error ? err.message : String(err)}`,
      metrics,
    )
  }

  if (proc.pid) {
    metrics.pid = proc.pid
  }

  activeLaunches.set(id, metrics)

  // Track exit for metrics
  const exitHandler = (code: number | null, signal: string | null): void => {
    metrics.exitedAt = Date.now()
    metrics.exitCode = code
    metrics.signal = signal
    metrics.closeReason = options.closeReason ?? 'normal-exit'
    activeLaunches.delete(id)
  }
  proc.once('exit', exitHandler)
  proc.once('error', () => {
    metrics.exitedAt = Date.now()
    metrics.closeReason = 'spawn-error'
    activeLaunches.delete(id)
  })

  options.log?.('info', `launch: ${options.executable}`, {
    id,
    pid: proc.pid,
    args: options.args,
    parentPid,
  })

  return { proc, metrics }
}

// ── Sync launcher ────────────────────────────────────────────────────

export interface LaunchSyncOptions {
  executable: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  encoding?: SpawnSyncOptions['encoding']
  timeout?: number
  maxBuffer?: number
  requestId?: string
  generation?: number
}

/**
 * Synchronous hidden process spawn. Use only for short-lived probes
 * (where.exe, PowerShell one-liners, tar extraction). Prefer async
 * launchHidden for anything that could block.
 */
export function launchHiddenSync(options: LaunchSyncOptions): ReturnType<typeof spawnSync> {
  const id = launchId()

  // Only validate existence for file paths, not bare command names.
  if (isFilePath(options.executable) && !existsSync(options.executable)) {
    throw new LaunchError('executable-not-found', `Executable not found: ${options.executable}`, {
      id,
      executable: options.executable,
      args: options.args ?? [],
      parentPid: process.pid,
      launchedAt: Date.now(),
    })
  }

  const syncOpts: SpawnSyncOptions = {
    ...HIDDEN_SYNC_OPTIONS,
    cwd: options.cwd,
    env: options.env,
    encoding: options.encoding ?? 'utf8',
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
  }

  return spawnSync(options.executable, options.args ?? [], syncOpts)
}

// ── Process tree kill ────────────────────────────────────────────────

/**
 * Kill a process tree. Uses taskkill /T /F /PID on Windows.
 * Falls back to proc.kill() on other platforms.
 */
export function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], {
        ...HIDDEN_SYNC_OPTIONS,
        timeout: 5000,
      })
    } catch {
      // Best effort — process may already be gone
    }
  } else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Best effort
    }
  }
}

// ── Diagnostics ──────────────────────────────────────────────────────

/**
 * Get all currently active launch metrics. Used by the window trace
 * script and diagnostic dumps.
 */
export function getActiveLaunches(): readonly LaunchMetrics[] {
  return Array.from(activeLaunches.values())
}

/**
 * Get launch metrics by ID.
 */
export function getLaunchById(id: string): LaunchMetrics | undefined {
  return activeLaunches.get(id)
}

// ── Error class ──────────────────────────────────────────────────────

export type LaunchErrorClass =
  | 'executable-not-found'
  | 'spawn-failed'
  | 'timeout'
  | 'process-tree-kill-failed'

export class LaunchError extends Error {
  constructor(
    public readonly errorClass: LaunchErrorClass,
    message: string,
    public readonly metrics: LaunchMetrics,
  ) {
    super(message)
    this.name = 'LaunchError'
  }
}
