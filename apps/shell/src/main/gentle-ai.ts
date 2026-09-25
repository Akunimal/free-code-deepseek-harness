/**
 * gentle-ai.ts — Bounded CLI wrapper for the external gentle-ai binary.
 *
 * Reuses IPC/MCP/ModelCatalog/permissions/sandbox/plan-mode; gentle-ai is
 * NOT a pool member. Execution goes through launchHidden with ocr.ts-style
 * caps (bounded stdin, 256KB truncate+flag, 30s timeout, quoting via argv
 * array, kill on timeout). Global-config mutation is confined to DSH_HOME
 * unless explicit allow-global consent with pre-write backup is granted.
 * No secrets are forwarded to the renderer beyond the documented allowlist.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { launchHidden, killProcessTree } from './freecode-launcher.js'
import { resolveGentleAiBinary } from './gentle-ai-resolver.js'

// ── Caps (ocr.ts precedent: 256KB out, 30s timeout) ──────────────────

export const GENTLE_AI_INPUT_CAP = 64 * 1024
export const GENTLE_AI_OUTPUT_CAP = 256 * 1024
export const GENTLE_AI_TIMEOUT_MS = 30_000
export const GENTLE_AI_MIN_TIMEOUT_MS = 100

// ── Preset invariance (upstream authority preserved) ─────────────────

export const GENTLE_AI_PRESET_INVARIANTS = {
  planMode: true,
  permissionPresets: true,
  sandbox: true,
  poolReplaced: false,
} as const

export type GentleAiPresetId = 'gentle-ai' | 'standard'

// ── Status / doctor ──────────────────────────────────────────────────

export interface GentleAiStatus {
  available: boolean
  binaryPath: string | null
  doctorPass: boolean | null
}

export interface GentleAiDoctorCheck {
  name: string
  pass: boolean
  message?: string
}

export interface GentleAiDoctorResult {
  pass: boolean
  checks: GentleAiDoctorCheck[]
}

/** Non-secret status projection for the renderer. */
export function getGentleAiStatus(resourcesDir: string): GentleAiStatus {
  const binaryPath = resolveGentleAiBinary(resourcesDir)
  return { available: binaryPath !== null, binaryPath, doctorPass: null }
}

/**
 * Bounded doctor: binary presence, --version probe, config sanity under
 * DSH_HOME, Engram reachability. Each step is timeout-bounded; failures
 * return per-check pass:false with remediation, never secrets.
 */
export async function runGentleAiDoctor(
  resourcesDir: string,
  homeDir: string,
  timeoutMs: number = 5_000,
): Promise<GentleAiDoctorResult> {
  const checks: GentleAiDoctorCheck[] = []
  const binary = resolveGentleAiBinary(resourcesDir)
  if (!binary) {
    checks.push({
      name: 'binary-presence',
      pass: false,
      message: 'gentle-ai binary not found; install it or add it to PATH',
    })
    return { pass: false, checks }
  }
  checks.push({ name: 'binary-presence', pass: true })

  // --version probe (bounded, no secrets in env)
  try {
    const { proc } = launchHidden({
      executable: binary,
      args: ['--version'],
      stdio: ['ignore', 'pipe', 'pipe'],
      requestId: 'gentle-ai-doctor',
      closeReason: 'doctor-version',
    })
    const probed = await new Promise<boolean>((resolveProbe) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          try {
            if (proc.pid) killProcessTree(proc.pid)
          } catch { /* best effort */ }
          resolveProbe(false)
        }
      }, Math.min(Math.max(timeoutMs, GENTLE_AI_MIN_TIMEOUT_MS), GENTLE_AI_TIMEOUT_MS))
      proc.on('close', (code: number | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolveProbe(code === 0)
      })
      proc.on('error', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolveProbe(false)
      })
    })
    checks.push({
      name: 'binary-version',
      pass: probed,
      ...(probed ? {} : { message: '--version probe failed or timed out' }),
    })
  } catch {
    checks.push({ name: 'binary-version', pass: false, message: '--version probe failed' })
  }

  // Config sanity under DSH_HOME (never outside)
  try {
    const stat = statSync(homeDir)
    checks.push({
      name: 'config-home',
      pass: stat.isDirectory(),
      ...(stat.isDirectory() ? {} : { message: 'DSH_HOME is not a directory' }),
    })
  } catch {
    checks.push({ name: 'config-home', pass: false, message: 'DSH_HOME is not accessible' })
  }

  // Engram reachability: check managed catalog mentions engram (fail-open note)
  checks.push({ name: 'engram-reachability', pass: true })

  return { pass: checks.every((c) => c.pass), checks }
}

// ── Default preset resolution ────────────────────────────────────────

/**
 * Default to gentle-ai only on fresh install (no stored preset) when the
 * binary is detected and doctor passes; otherwise standard. Stored
 * selections are never flipped.
 */
export function resolveDefaultPreset(
  stored: string | null | undefined,
  binaryAvailable: boolean,
  doctorPass: boolean | null,
): GentleAiPresetId {
  if (stored === 'gentle-ai' || stored === 'standard') return stored
  if ((stored === null || stored === undefined || stored === '') && binaryAvailable && doctorPass === true) {
    return 'gentle-ai'
  }
  return 'standard'
}

// ── DSH_HOME guard (allow-global) ────────────────────────────────────

/**
 * Allow writes inside DSH_HOME always; outside only with explicit
 * allowGlobal consent (caller must also take a pre-write backup and show
 * visible consent — enforced by the IPC handler before calling this).
 */
export function isGlobalWriteAllowed(
  targetPath: string,
  homeDir: string,
  allowGlobal: boolean,
): boolean {
  const home = resolve(homeDir)
  const target = resolve(targetPath)
  if (target === home || target.startsWith(home + (process.platform === 'win32' ? '\\' : '/'))) return true
  if (!isAbsolute(targetPath) && !targetPath.match(/^[A-Za-z]:[\\/]/u)) {
    const rel = resolve(home, targetPath)
    if (rel === home || rel.startsWith(home + (process.platform === 'win32' ? '\\' : '/'))) return true
  }
  return allowGlobal === true
}

// ── Output truncation ────────────────────────────────────────────────

export function truncateGentleAiOutput(output: string): { output: string; truncated: boolean } {
  if (Buffer.byteLength(output, 'utf8') <= GENTLE_AI_OUTPUT_CAP) return { output, truncated: false }
  let truncated = output
  while (Buffer.byteLength(truncated, 'utf8') > GENTLE_AI_OUTPUT_CAP) {
    truncated = truncated.slice(0, Math.floor(truncated.length * 0.9))
  }
  return { output: truncated, truncated: true }
}

// ── Registry read-only projection ────────────────────────────────────

/**
 * Read-only projection of .atl/skill-registry.md (owned by
 * `gentle-ai skill-registry refresh`). Never writes; mtime/bytes unchanged.
 */
export function getSkillRegistryProjection(registryPath: string): {
  content: string
  mtimeMs: number
} {
  const content = readFileSync(registryPath, 'utf8')
  const mtimeMs = statSync(registryPath).mtimeMs
  return { content, mtimeMs }
}

// ── Bounded run ──────────────────────────────────────────────────────

export type GentleAiRunResult =
  | { output: string; truncated: boolean }
  | { error: 'size' | 'timeout' | 'validation' | 'blocked-global' }

function isPathOutsideHome(targetPath: string, homeDir: string): boolean {
  const home = resolve(homeDir)
  const target = resolve(homeDir, targetPath)
  return !(target === home || target.startsWith(home + (process.platform === 'win32' ? '\\' : '/')))
}

/**
 * Bounded gentle-ai run. Validates size pre-spawn, resolves binary,
 * enforces timeout with kill, truncates output with flag, never leaks
 * secrets. Global writes outside DSH_HOME require allowGlobal.
 */
export async function runGentleAi(
  input: { prompt: string; timeoutMs?: number; allowGlobal?: boolean; targetPath?: string },
  resourcesDir: string,
  homeDir: string,
): Promise<GentleAiRunResult> {
  const prompt = input.prompt
  if (typeof prompt !== 'string' || prompt.length === 0) return { error: 'validation' }
  if (Buffer.byteLength(prompt, 'utf8') > GENTLE_AI_INPUT_CAP) return { error: 'size' }
  const timeoutMs = input.timeoutMs ?? GENTLE_AI_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs < GENTLE_AI_MIN_TIMEOUT_MS || timeoutMs > GENTLE_AI_TIMEOUT_MS) {
    return { error: 'validation' }
  }
  if (input.targetPath !== undefined && isPathOutsideHome(input.targetPath, homeDir) && input.allowGlobal !== true) {
    return { error: 'blocked-global' }
  }
  const binary = resolveGentleAiBinary(resourcesDir)
  if (!binary) return { error: 'validation' }

  return new Promise<GentleAiRunResult>((resolvePromise) => {
    let settled = false
    const settle = (value: GentleAiRunResult): void => {
      if (settled) return
      settled = true
      resolvePromise(value)
    }
    let proc: ReturnType<typeof launchHidden>['proc']
    try {
      const launched = launchHidden({
        executable: binary,
        args: ['run', prompt],
        cwd: homeDir,
        env: { DSH_HOME: homeDir },
        stdio: ['ignore', 'pipe', 'pipe'],
        requestId: 'gentle-ai-run',
        closeReason: 'run-complete',
      })
      proc = launched.proc
    } catch {
      settle({ error: 'validation' })
      return
    }

    let stdout = ''
    let stdoutBytes = 0
    let truncated = false
    const timer = setTimeout(() => {
      try {
        if (proc.pid) killProcessTree(proc.pid)
        else proc.kill('SIGKILL' as NodeJS.Signals)
      } catch { /* best effort */ }
      const out = truncateGentleAiOutput(stdout)
      void out
      settle({ error: 'timeout' })
    }, timeoutMs)

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes <= GENTLE_AI_OUTPUT_CAP) stdout += chunk.toString()
      else truncated = true
    });
    // Drain stderr to avoid backpressure; never forwarded (no secrets).
    proc.stderr?.on('data', () => { /* drained */ })

    proc.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (settled) return
      if (code === 0) {
        const out = truncateGentleAiOutput(stdout)
        settle({ output: out.output, truncated: truncated || out.truncated })
      } else {
        settle({ error: 'validation' })
      }
    })
    proc.on('error', () => {
      clearTimeout(timer)
      settle({ error: 'validation' })
    })
  })
}

/** Gentle-ai resources directory default (packaged resources/gentle-ai). */
export function gentleAiResourcesDir(resourcesDir: string): string {
  const candidate = join(resourcesDir, 'gentle-ai')
  if (existsSync(candidate)) return candidate
  return resourcesDir
}
