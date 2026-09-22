import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchHiddenSync } from './freecode-launcher.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Product-managed uv bootstrap for Windows MCP servers.
 *
 * We do not run an installer script or mutate PATH. The official uv ZIP is
 * downloaded over HTTPS, checked against a pinned SHA-256, extracted into a
 * per-user tools directory, and invoked by absolute path. That keeps NSIS,
 * portable installs, and user-installed uvx independent from one another.
 */
export const MANAGED_UV_VERSION = '0.12.10'
export const MANAGED_UV_ARCHIVE_SHA256 = 'f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2'
export const MANAGED_UV_ARCHIVE_URL = `https://releases.astral.sh/github/uv/releases/download/${MANAGED_UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`
export const UVX_DOWNLOAD_MAX_BYTES = 32 * 1024 * 1024
export const UVX_DOWNLOAD_TIMEOUT_MS = 60_000

export interface UvxBootstrapOptions {
  platform?: NodeJS.Platform
  userDataDir: string
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  pathLookup?: (name: string, env: NodeJS.ProcessEnv) => string | undefined
  /** Override for the vendored-binary search roots (testability). When
   *  omitted, the packaged-layout candidates below are used. */
  vendoredRoots?: string[]
  log?: (level: 'info' | 'warn', message: string, meta?: Record<string, unknown>) => void
}

function isWindowsExecutable(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    const stat = statSync(path)
    if (!stat.isFile() || stat.size < 2 || stat.size > 64 * 1024 * 1024) return false
    return readFileSync(path).subarray(0, 2).toString('ascii') === 'MZ'
  } catch {
    return false
  }
}

function firstPathExecutable(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const cleanEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) cleanEnv[k] = v
  }
  const result = launchHiddenSync({
    executable: 'where.exe',
    args: [name],
    encoding: 'utf8',
    env: cleanEnv,
    timeout: 10_000,
  })
  if (result.status !== 0 || result.error) return undefined
  const stdout = typeof result.stdout === 'string' ? result.stdout : ''
  return stdout
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .find((candidate: string) => candidate.length > 0 && isWindowsExecutable(candidate))
}

function findExtractedExecutable(root: string, name: string): string | undefined {
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()!
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
      } else if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase() && isWindowsExecutable(path)) {
        return path
      }
    }
  }
  return undefined
}

function powershellPathLiteral(path: string): string {
  return `'${resolve(path).replaceAll("'", "''")}'`
}

function extractZip(archivePath: string, destination: string): void {
  const script = [
    '$ErrorActionPreference = "Stop"',
    `Expand-Archive -LiteralPath ${powershellPathLiteral(archivePath)} -DestinationPath ${powershellPathLiteral(destination)} -Force`,
  ].join('; ')
  const result = launchHiddenSync({
    executable: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ],
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Expand-Archive failed: ${String(result.stderr || result.stdout).trim()}`)
  }
}

async function downloadArchive(fetchImpl: typeof fetch, archivePath: string): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UVX_DOWNLOAD_TIMEOUT_MS)
  try {
    const response = await fetchImpl(MANAGED_UV_ARCHIVE_URL, {
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} from Astral uv release`)
    const finalHost = new URL(response.url).hostname.toLowerCase()
    const trustedHosts = new Set([
      'releases.astral.sh',
      'github.com',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com',
    ])
    if (!trustedHosts.has(finalHost)) throw new Error(`uv archive redirected to an untrusted host: ${finalHost}`)
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (Number.isFinite(contentLength) && contentLength > UVX_DOWNLOAD_MAX_BYTES) {
      throw new Error(`uv archive exceeds the ${UVX_DOWNLOAD_MAX_BYTES} byte safety limit`)
    }
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length === 0 || body.length > UVX_DOWNLOAD_MAX_BYTES) {
      throw new Error(`uv archive has invalid size: ${body.length} bytes`)
    }
    const digest = createHash('sha256').update(body).digest('hex')
    if (digest !== MANAGED_UV_ARCHIVE_SHA256) {
      throw new Error(`uv archive SHA-256 mismatch: expected ${MANAGED_UV_ARCHIVE_SHA256}, got ${digest}`)
    }
    writeFileSync(archivePath, body, { flag: 'wx', mode: 0o600 })
  } finally {
    clearTimeout(timeout)
  }
}

async function installManagedUvxAsync(userDataDir: string, fetchImpl: typeof fetch): Promise<string> {
  const toolsDir = join(userDataDir, 'tools')
  const managedUvx = join(toolsDir, 'uvx.exe')
  if (isWindowsExecutable(managedUvx)) return managedUvx

  mkdirSync(toolsDir, { recursive: true })
  const workDir = join(tmpdir(), `freecode-uv-${process.pid}-${Date.now()}`)
  const archivePath = join(workDir, 'uv.zip')
  const extractDir = join(workDir, 'extract')
  const temporaryUvx = join(toolsDir, `.uvx-${process.pid}-${Date.now()}.tmp`)
  mkdirSync(extractDir, { recursive: true })
  try {
    await downloadArchive(fetchImpl, archivePath)
    extractZip(archivePath, extractDir)
    const extractedUvx = findExtractedExecutable(extractDir, 'uvx.exe')
    if (!extractedUvx) throw new Error('the verified uv archive did not contain uvx.exe')
    writeFileSync(temporaryUvx, readFileSync(extractedUvx), { mode: 0o700 })
    renameSync(temporaryUvx, managedUvx)
    if (!isWindowsExecutable(managedUvx)) throw new Error('managed uvx.exe failed the PE validation')
    return managedUvx
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }) } catch { /* best effort */ }
    try { rmSync(temporaryUvx, { force: true }) } catch { /* best effort */ }
  }
}

/**
 * Resolve an executable for the managed MCP catalog. Priority order:
 * 1. Vendored uv in resources/freecode/uv/ (offline-safe, no download)
 * 2. User-installed uvx on PATH
 * 3. Managed bootstrap download (last resort)
 */
export async function ensureUvxCommand(options: UvxBootstrapOptions): Promise<string | undefined> {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return undefined
  const env = options.env ?? process.env
  const pathLookup = options.pathLookup ?? firstPathExecutable

  // 1. Check for vendored uv in the payload (try multiple __dirname layouts).
  //    In a packaged Electron app __dirname resolves inside app.asar; the
  //    freecode/ tree lives outside the asar, so we also try the parent of
  //    app.asar (4 levels up from dist/src/main).
  const vendoredCandidates = (options.vendoredRoots ?? [
    join(__dirname, '..', '..', '..', '..', 'resources'),
    join(__dirname, '..', '..', '..', 'resources'),
    join(__dirname, '..', '..', 'resources'),
  ]).map((root) => join(root, 'freecode', 'uv', 'uvx.exe'))
  for (const vendoredUvx of vendoredCandidates) {
    if (existsSync(vendoredUvx)) {
      options.log?.('info', 'using vendored uvx from payload', { path: vendoredUvx })
      return vendoredUvx
    }
  }

  // 2. Check user PATH
  const existing = pathLookup('uvx.exe', env) ?? pathLookup('uvx', env)
  if (existing) {
    options.log?.('info', 'using user-installed uvx', { path: existing })
    return existing
  }

  // 3. Last resort: managed bootstrap download
  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const managed = await installManagedUvxAsync(options.userDataDir, fetchImpl)
    options.log?.('info', 'installed managed uvx silently', {
      path: managed,
      version: MANAGED_UV_VERSION,
    })
    return managed
  } catch (error) {
    options.log?.('warn', 'uvx bootstrap unavailable; MCP servers remain recoverable but disabled by the child process', {
      error: error instanceof Error ? error.message : String(error),
      version: MANAGED_UV_VERSION,
    })
    return undefined
  }
}
