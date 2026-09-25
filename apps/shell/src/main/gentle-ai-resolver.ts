/**
 * gentle-ai-resolver.ts — Packaged binary resolution for Gentle-AI.
 *
 * Checks bundled paths under resourcesDir first, then falls back to PATH
 * lookup via launchHiddenSync with windowsHide:true. Results are cached
 * to avoid repeated filesystem probes. Null-safe absence (never throws
 * for missing binary; lookup failures return null).
 * Mirrors caveman-resolver.ts precedent.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { launchHiddenSync } from './freecode-launcher.js'

// ── Cache ────────────────────────────────────────────────────────────

const resolutionCache: Map<string, string | null> = new Map()

// ── Gentle-AI ────────────────────────────────────────────────────────

const GENTLE_AI_BUNDLED_NAMES = ['gentle-ai.exe', 'gentle-ai']

/**
 * Resolve the Gentle-AI binary path. Checks bundled paths under
 * resourcesDir first, then falls back to PATH.
 * Returns null if no executable is found (never throws for absence).
 */
export function resolveGentleAiBinary(resourcesDir: string): string | null {
  const cacheKey = `gentle-ai:${resourcesDir}`
  if (resolutionCache.has(cacheKey)) return resolutionCache.get(cacheKey)!

  // Check bundled paths first: resources/gentle-ai/gentle-ai.exe
  for (const name of GENTLE_AI_BUNDLED_NAMES) {
    const candidate = join(resourcesDir, 'gentle-ai', name)
    if (existsSync(candidate)) {
      resolutionCache.set(cacheKey, candidate)
      return candidate
    }
  }

  // Check resourcesDir root
  for (const name of GENTLE_AI_BUNDLED_NAMES) {
    const candidate = join(resourcesDir, name)
    if (existsSync(candidate)) {
      resolutionCache.set(cacheKey, candidate)
      return candidate
    }
  }

  // PATH fallback via where.exe (Windows) or which (non-Windows)
  const lookupCmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const result = launchHiddenSync({
      executable: lookupCmd,
      args: ['gentle-ai'],
      timeout: 5_000,
    })
    if (result.status === 0 && result.stdout) {
      const firstLine = result.stdout.toString().trim().split('\n')[0]?.trim()
      if (firstLine && existsSync(firstLine)) {
        resolutionCache.set(cacheKey, firstLine)
        return firstLine
      }
    }
  } catch {
    // Lookup failed — continue to return null
  }

  resolutionCache.set(cacheKey, null)
  return null
}

/**
 * Check whether Gentle-AI is available (bundled or on PATH).
 */
export function isGentleAiAvailable(resourcesDir: string): boolean {
  return resolveGentleAiBinary(resourcesDir) !== null
}

// ── Cache management ─────────────────────────────────────────────────

/**
 * Clear the resolution cache. Useful for tests.
 */
export function _clearCache(): void {
  resolutionCache.clear()
}
