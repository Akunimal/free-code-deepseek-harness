/**
 * git-resolver.ts — Deterministic Git path resolution and error classification.
 *
 * This module provides:
 *   1. Deterministic Git path resolution: packaged Git → validated system Git
 *   2. Structured error classification for every Git failure
 *   3. Environment caching to avoid repeated PATH lookups
 *   4. Pre-operation validation (git --version, rev-parse, status, diff)
 */

import { launchHiddenSync } from '../main/freecode-launcher.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// ── Error classes ──────────────────────────────────────────────────

export type GitErrorClass =
  | 'executable-not-found'
  | 'sandbox-denied'
  | 'not-a-repository'
  | 'git-failed'
  | 'timeout'
  | 'network-denied'

export class GitError extends Error {
  constructor(
    public readonly errorClass: GitErrorClass,
    message: string,
    public readonly details: {
      resolvedPath?: string
      version?: string
      cwd?: string
      exitCode?: number | null
      timeout?: number
      stderr?: string
    } = {},
  ) {
    super(message)
    this.name = 'GitError'
  }
}

// ── Types ──────────────────────────────────────────────────────────

export interface GitResolveResult {
  /** Absolute path to the git executable. */
  path: string
  /** Git version string (e.g. "git version 2.44.0.windows.1"). */
  version: string
  /** How the path was resolved. */
  source: 'packaged' | 'system-path' | 'system-absolute'
  /** Whether the resolved git can reach the network. */
  networkAvailable: boolean
}

export interface GitValidationResult {
  /** The resolved Git info used for validation. */
  resolve: GitResolveResult
  /** Whether git --version succeeded. */
  versionOk: boolean
  /** Whether git -C <cwd> rev-parse --show-toplevel succeeded. */
  repoOk: boolean
  /** Whether git -C <cwd> status --porcelain succeeded. */
  statusOk: boolean
  /** Whether git -C <cwd> diff --check succeeded. */
  diffOk: boolean
  /** If any check failed, the classified error. */
  error?: GitError
}

export interface GitCommandResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  error?: GitError
}

// ── Environment cache ──────────────────────────────────────────────

const GIT_ENV_CACHE = new Map<string, GitResolveResult>()

/**
 * Reset the environment cache. Used in tests.
 */
export function resetGitResolver(): void {
  GIT_ENV_CACHE.clear()
}

// ── Path resolution ────────────────────────────────────────────────

/**
 * Resolve the Git executable path deterministically:
 *   1. Packaged Git (resources/freecode/git/git.exe)
 *   2. System Git from PATH
 *   3. Common absolute paths on Windows
 *
 * The resolved path is cached to avoid repeated lookups.
 */
export function resolveGitPath(options: {
  packagedResourcesDir?: string
  /** Override for testing. */
  pathOverride?: string
} = {}): GitResolveResult {
  const cacheKey = [options.packagedResourcesDir ?? 'default', options.pathOverride ?? '__default__'].join(':')
  const cached = GIT_ENV_CACHE.get(cacheKey)
  if (cached) return cached

  // 1. Packaged Git
  if (options.packagedResourcesDir) {
    const packagedGit = join(options.packagedResourcesDir, 'freecode', 'git', 'git.exe')
    if (existsSync(packagedGit)) {
      const version = getGitVersion(packagedGit)
      if (version) {
        const result: GitResolveResult = {
          path: packagedGit,
          version,
          source: 'packaged',
          networkAvailable: true, // packaged git has no sandbox restrictions
        }
        GIT_ENV_CACHE.set(cacheKey, result)
        return result
      }
    }
  }

  // 2. System Git from PATH (skip when pathOverride is explicitly empty — sandbox simulation)
  if (options.pathOverride !== '') {
    const systemGit = findInPath('git', options.pathOverride)
    if (systemGit) {
      const version = getGitVersion(systemGit)
      if (version) {
        const result: GitResolveResult = {
          path: systemGit,
          version,
          source: 'system-path',
          networkAvailable: true,
        }
        GIT_ENV_CACHE.set(cacheKey, result)
        return result
      }
    }
  }

  // 3. Common absolute paths on Windows (only when no explicit pathOverride)
  if (process.platform === 'win32' && options.pathOverride === undefined) {
    const commonPaths = [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'cmd', 'git.exe'),
    ]
    for (const candidate of commonPaths) {
      if (existsSync(candidate)) {
        const version = getGitVersion(candidate)
        if (version) {
          const result: GitResolveResult = {
            path: candidate,
            version,
            source: 'system-absolute',
            networkAvailable: true,
          }
          GIT_ENV_CACHE.set(cacheKey, result)
          return result
        }
      }
    }
  }

  throw new GitError(
    'executable-not-found',
    'Git executable not found in PATH, packaged resources, or common locations',
  )
}

/**
 * Find an executable in PATH.
 */
function findInPath(name: string, pathOverride?: string): string | null {
  const pathDirs = (pathOverride ?? process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of pathDirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

/**
 * Get git version string.
 */
function getGitVersion(gitPath: string): string | null {
  try {
    const result = launchHiddenSync({
      executable: gitPath,
      args: ['--version'],
      encoding: 'utf8',
      timeout: 5_000,
    })
    if (result.status === 0 && result.stdout) {
      return result.stdout.toString().trim()
    }
  } catch {
    // Binary exists but can't execute
  }
  return null
}

// ── Validation ─────────────────────────────────────────────────────

/**
 * Validate that Git works correctly for a given working directory.
 * Runs: git --version, rev-parse, status, diff.
 */
export function validateGit(options: {
  cwd: string
  packagedResourcesDir?: string
  pathOverride?: string
  timeoutMs?: number
}): GitValidationResult {
  const resolve = (() => {
    try {
      return resolveGitPath(options)
    } catch (err) {
      return null
    }
  })()

  if (!resolve) {
    return {
      resolve: { path: '', version: '', source: 'system-path', networkAvailable: false },
      versionOk: false,
      repoOk: false,
      statusOk: false,
      diffOk: false,
      error: new GitError('executable-not-found', 'Git not found'),
    }
  }

  const timeout = options.timeoutMs ?? 10_000

  // git --version (already validated during resolve, but double-check)
  const versionOk = Boolean(resolve.version)

  // git rev-parse --show-toplevel
  const repoResult = runGit(resolve.path, ['-C', options.cwd, 'rev-parse', '--show-toplevel'], timeout)
  const repoOk = repoResult.exitCode === 0

  if (!repoOk) {
    const errorClass = classifyGitError(repoResult)
    return {
      resolve,
      versionOk,
      repoOk: false,
      statusOk: false,
      diffOk: false,
      error: new GitError(errorClass, `Git rev-parse failed: ${repoResult.stderr.slice(0, 500)}`, {
        resolvedPath: resolve.path,
        version: resolve.version,
        cwd: options.cwd,
        exitCode: repoResult.exitCode,
        stderr: repoResult.stderr.slice(0, 500),
      }),
    }
  }

  // git status --porcelain
  const statusResult = runGit(resolve.path, ['-C', options.cwd, 'status', '--porcelain'], timeout)
  const statusOk = statusResult.exitCode === 0

  // git diff --check
  const diffResult = runGit(resolve.path, ['-C', options.cwd, 'diff', '--check'], timeout)
  const diffOk = diffResult.exitCode === 0

  return {
    resolve,
    versionOk,
    repoOk,
    statusOk,
    diffOk,
    error: !statusOk || !diffOk
      ? new GitError('git-failed', `Git validation failed (status=${statusResult.exitCode}, diff=${diffResult.exitCode})`, {
          resolvedPath: resolve.path,
          version: resolve.version,
          cwd: options.cwd,
          exitCode: statusResult.exitCode ?? diffResult.exitCode,
          stderr: (statusResult.stderr + '\n' + diffResult.stderr).slice(0, 500),
        })
      : undefined,
  }
}

// ── Command execution ──────────────────────────────────────────────

/**
 * Run a git command with timeout and structured error handling.
 */
export function runGitCommand(options: {
  gitPath: string
  args: string[]
  cwd: string
  timeoutMs?: number
  env?: Record<string, string>
}): GitCommandResult {
  const timeout = options.timeoutMs ?? 30_000
  const start = Date.now()
  const result = runGit(options.gitPath, options.args, timeout, options.cwd, options.env)
  const durationMs = Date.now() - start

  let error: GitError | undefined
  if (result.exitCode !== 0) {
    const errorClass = classifyGitError(result)
    error = new GitError(errorClass, `git ${options.args[0]} failed (exit=${result.exitCode})`, {
      resolvedPath: options.gitPath,
      cwd: options.cwd,
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 1_024),
    })
  }

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs,
    error,
  }
}

function runGit(
  gitPath: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
  env?: Record<string, string>,
): { exitCode: number | null; stdout: string; stderr: string } {
  try {
    const result = launchHiddenSync({
      executable: gitPath,
      args,
      encoding: 'utf8',
      timeout: timeoutMs,
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
    })
    return {
      exitCode: result.status,
      stdout: result.stdout?.toString() ?? '',
      stderr: result.stderr?.toString() ?? '',
    }
  } catch (err) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Error classification ───────────────────────────────────────────

/**
 * Classify a Git failure into a structured error class.
 */
export function classifyGitError(result: { exitCode: number | null; stderr: string }): GitErrorClass {
  const stderr = result.stderr.toLowerCase()

  // Permission denied / sandbox
  if (stderr.includes('permission denied') || stderr.includes('access denied')) {
    return 'sandbox-denied'
  }

  // Not a repository
  if (stderr.includes('not a git repository') || stderr.includes('not a repository')) {
    return 'not-a-repository'
  }

  // Network issues
  if (
    stderr.includes('could not resolve host') ||
    stderr.includes('unable to access') ||
    stderr.includes('failed to connect') ||
    stderr.includes('connection refused') ||
    stderr.includes('network is unreachable')
  ) {
    return 'network-denied'
  }

  // Timeout
  if (stderr.includes('timeout') || stderr.includes('timed out')) {
    return 'timeout'
  }

  // Generic git failure
  return 'git-failed'
}
