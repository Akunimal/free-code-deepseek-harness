import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { launchHiddenAndWait } from './freecode-launcher.js'
import { assertHeadlessDesktopRuntime } from './headless-runtime-capability.js';

const semver = createRequire(import.meta.url)('semver') as {
  gte(version: string, range: string): boolean;
  satisfies(version: string, range: string): boolean;
  valid(version: string): string | null;
  validRange(range: string): string | null;
  compare(versionA: string, versionB: string): number;
};

export interface HarnessUpdateInfo {
  currentVersion?: string;
  latestVersion?: string;
  assetName?: string;
  assetUrl?: string;
  digest?: string;
  available: boolean;
  error?: string;
}

export interface HarnessUpdaterAdapter {
  check(requiredVersion?: string): Promise<HarnessUpdateInfo>;
  downloadAndInstall(
    info: HarnessUpdateInfo,
    onProgress?: HarnessDownloadProgressHandler,
    requirements?: HarnessRuntimeRequirements,
  ): Promise<void>;
}

/** Requirements compiled into the shell from the locally audited DSH runtime. */
export interface HarnessRuntimeRequirements {
  minimumVersion?: string;
  nodeModuleVersion?: string;
}

export interface HarnessRuntimePromotionFileSystem {
  exists(path: string): boolean;
  rename(from: string, to: string): void;
  remove(path: string, recursive: boolean): void;
}

const promotionFileSystem: HarnessRuntimePromotionFileSystem = {
  exists: existsSync,
  rename: renameSync,
  remove: (path, recursive) => rmSync(path, { recursive, force: true, maxRetries: recursive ? 5 : undefined, retryDelay: 200 }),
};

/** Promote an already-verified staged runtime without deleting an unbacked current cache. */
export function promoteHarnessRuntime(
  nextHarness: string,
  nextManifest: string,
  targetRoot: string,
  validate: (harnessDir: string, manifestPath: string) => void,
  fileSystem: HarnessRuntimePromotionFileSystem = promotionFileSystem,
): void {
  const currentHarness = resolve(targetRoot, 'dsh');
  const backupHarness = resolve(targetRoot, `.dsh-backup-${process.pid}-${Date.now()}`);
  const currentManifest = resolve(targetRoot, 'runtime-manifest.json');
  const backupManifest = resolve(targetRoot, `.runtime-manifest-backup-${process.pid}-${Date.now()}`);
  if (!fileSystem.exists(nextManifest)) throw new Error('Harness runtime is missing runtime-manifest.json');
  let harnessBackedUp = false;
  let manifestBackedUp = false;
  let harnessPromoted = false;
  let manifestPromoted = false;
  try {
    if (fileSystem.exists(currentHarness)) {
      fileSystem.rename(currentHarness, backupHarness);
      harnessBackedUp = true;
    }
    if (fileSystem.exists(currentManifest)) {
      fileSystem.rename(currentManifest, backupManifest);
      manifestBackedUp = true;
    }
    fileSystem.rename(nextHarness, currentHarness);
    harnessPromoted = true;
    fileSystem.rename(nextManifest, currentManifest);
    manifestPromoted = true;
    validate(currentHarness, currentManifest);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    const attemptRollback = (operation: () => void): void => {
      try {
        operation();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    };
    if (harnessPromoted && fileSystem.exists(currentHarness)) {
      attemptRollback(() => fileSystem.remove(currentHarness, true));
    }
    if (harnessBackedUp && fileSystem.exists(backupHarness)) {
      attemptRollback(() => fileSystem.rename(backupHarness, currentHarness));
    }
    if (manifestPromoted && fileSystem.exists(currentManifest)) {
      attemptRollback(() => fileSystem.remove(currentManifest, false));
    }
    if (manifestBackedUp && fileSystem.exists(backupManifest)) {
      attemptRollback(() => fileSystem.rename(backupManifest, currentManifest));
    }
    if (rollbackErrors.length > 0) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AggregateError([error, ...rollbackErrors], `Harness runtime promotion failed and rollback was incomplete; preserved backups may remain. Cause: ${reason}`);
    }
    throw error;
  }

  // Promotion and validation have committed. A backup cleanup issue must not
  // trigger a reverse swap after the valid new runtime is already in service.
  if (harnessBackedUp && fileSystem.exists(backupHarness)) {
    try { fileSystem.remove(backupHarness, true); } catch { /* retain the old cache as a recoverable backup */ }
  }
  if (manifestBackedUp && fileSystem.exists(backupManifest)) {
    try { fileSystem.remove(backupManifest, false); } catch { /* retain the old manifest as a recoverable backup */ }
  }
}

export interface HarnessDownloadProgress {
  phase: 'download' | 'extract';
  receivedBytes?: number;
  totalBytes?: number;
}

export type HarnessDownloadProgressHandler = (progress: HarnessDownloadProgress) => void;

interface GitHubReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
  digest?: unknown;
}

interface GitHubRelease {
  assets?: unknown;
}

const DEFAULT_REPO = 'Akunimal/free-code-deepseek-harness';
const DEFAULT_HARNESS_RESPONSE_TIMEOUT_MS = 30_000;
const DEFAULT_HARNESS_DOWNLOAD_IDLE_TIMEOUT_MS = 2 * 60_000;

/**
 * Resolve the tar binary used for harness runtime extraction.
 *
 * On Windows we must NOT rely on PATH resolution: a Git-for-Windows install
 * puts msys GNU tar first, and it misparses native `D:\...` paths as remote
 * `host:file` tapes ("Cannot connect to D: resolve failed"). System32 bsdtar
 * ships with every supported Windows release and handles native paths, so it
 * is pinned explicitly with a PATH fallback for exotic layouts.
 */
export function resolveTarExecutable(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    const systemTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    if (existsSync(systemTar)) return systemTar;
  }
  return 'tar';
}

export function harnessPlatform(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
}

export function harnessAssetName(version: string, platform: NodeJS.Platform, arch: string): string {
  return `deepseek-harness-runtime-${version}-${harnessPlatform(platform)}-${arch}.tar.gz`;
}

export async function checkHarnessRelease(
  currentVersion: string | undefined,
  platform: NodeJS.Platform,
  arch: string,
  fetchImpl: typeof fetch = fetch,
  repo = DEFAULT_REPO,
  requiredVersion?: string,
): Promise<HarnessUpdateInfo> {
  try {
    if (requiredVersion !== undefined && semver.valid(requiredVersion) !== requiredVersion) {
      throw new Error(`Requested DSH runtime version is invalid: ${requiredVersion}`);
    }
    // The packaged shell carries the exact DSH source version audited against
    // its Electron ABI. Search published releases (including prereleases) and
    // request that exact asset instead of GitHub's full-release-only `/latest`.
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'free-code-deepseek-harness-updater',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub harness release check returned HTTP ${response.status}`);
    const releases = (await response.json()) as unknown;
    if (!Array.isArray(releases)) throw new Error('GitHub harness release check returned an invalid release list');
    const platformName = harnessPlatform(platform);
    const suffix = `-${platformName}-${arch}.tar.gz`;
    const prefix = 'deepseek-harness-runtime-';
    const candidates = releases.flatMap((release: unknown) => {
      if (release === null || typeof release !== 'object') return [];
      const releaseAssets = (release as GitHubRelease).assets;
      return Array.isArray(releaseAssets) ? releaseAssets as GitHubReleaseAsset[] : [];
    }).flatMap((asset) => {
      if (typeof asset.name !== 'string' || !asset.name.startsWith(prefix) || !asset.name.endsWith(suffix) ||
          typeof asset.browser_download_url !== 'string') return [];
      const version = asset.name.slice(prefix.length, -suffix.length);
      if (semver.valid(version) !== version) return [];
      return [{ version, asset }];
    });
    const assetMatch = requiredVersion === undefined
      ? candidates.sort((left, right) => semver.compare(right.version, left.version))[0]
      : candidates.find(candidate => candidate.version === requiredVersion);
    const assetName = typeof assetMatch?.asset.name === 'string' ? assetMatch.asset.name : undefined;
    const assetUrl = typeof assetMatch?.asset.browser_download_url === 'string' ? assetMatch.asset.browser_download_url : undefined;
    const digest = typeof assetMatch?.asset.digest === 'string' ? assetMatch.asset.digest : undefined;
    const latestVersion = assetMatch?.version;
    const unknownCurrentVersion = requiredVersion === undefined && currentVersion === undefined;
    return {
      currentVersion,
      latestVersion,
      ...(assetName === undefined ? {} : { assetName }),
      ...(assetUrl === undefined ? {} : { assetUrl }),
      ...(digest === undefined ? {} : { digest }),
      available: Boolean(
        latestVersion && assetUrl && (
          requiredVersion !== undefined ||
          (currentVersion !== undefined && semver.compare(latestVersion, currentVersion) > 0)
        ),
      ),
      ...(!assetMatch
        ? {
          error: requiredVersion === undefined
            ? `No compatible harness asset for ${platformName}-${arch}`
            : `No harness runtime asset for packaged version ${requiredVersion} (${platformName}-${arch})`,
        }
        : unknownCurrentVersion
          ? { error: 'Installed harness runtime version is unknown; refusing to offer a runtime update' }
          : {}),
    };
  } catch (error) {
    return {
      currentVersion,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createHarnessUpdater(options: {
  resourcesDir: string;
  currentVersion?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  repo?: string;
  fetchImpl?: typeof fetch;
}): HarnessUpdaterAdapter {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    check: requiredVersion => checkHarnessRelease(options.currentVersion, platform, arch, fetchImpl, options.repo, requiredVersion),
    downloadAndInstall: (info, onProgress, requirements) =>
      installHarnessRuntime(info, options.resourcesDir, fetchImpl, onProgress, {}, requirements),
  };
}

export async function installHarnessRuntime(
  info: HarnessUpdateInfo,
  resourcesDir: string,
  fetchImpl: typeof fetch = fetch,
  onProgress?: HarnessDownloadProgressHandler,
  timeoutOptions: { responseTimeoutMs?: number; idleTimeoutMs?: number } = {},
  requirements?: HarnessRuntimeRequirements,
): Promise<void> {
  if (!info.assetUrl) throw new Error('Harness update has no compatible runtime asset');
  validateHarnessAssetUrl(info.assetUrl);
  if (!info.digest) throw new Error('Harness release asset is missing the required SHA-256 digest');
  const targetRoot = resolve(resourcesDir);
  mkdirSync(dirname(targetRoot), { recursive: true });
  // Keep staging and final runtime on the same volume so directory renames are
  // atomic even when a portable install lives on a different drive from %TEMP%.
  const tempRoot = mkdtempSync(join(dirname(targetRoot), '.freecode-harness-update-'));
  const archivePath = join(tempRoot, basename(info.assetName ?? 'harness.tar.gz'));
  const extractRoot = join(tempRoot, 'extract');
  const controller = new AbortController();
  const responseTimeoutMs = timeoutOptions.responseTimeoutMs ?? DEFAULT_HARNESS_RESPONSE_TIMEOUT_MS;
  const idleTimeoutMs = timeoutOptions.idleTimeoutMs ?? DEFAULT_HARNESS_DOWNLOAD_IDLE_TIMEOUT_MS;
  let downloadTimeout: ReturnType<typeof setTimeout> | undefined;
  let timeoutError: Error | undefined;
  let receivedBytes = 0;
  const clearDownloadTimeout = (): void => {
    if (downloadTimeout !== undefined) clearTimeout(downloadTimeout);
    downloadTimeout = undefined;
  };
  const armDownloadTimeout = (timeoutMs: number, message: string | (() => string)): void => {
    clearDownloadTimeout();
    downloadTimeout = setTimeout(() => {
      timeoutError = new Error(typeof message === 'function' ? message() : message);
      timeoutError.name = 'TimeoutError';
      controller.abort(timeoutError);
    }, timeoutMs);
  };
  try {
    mkdirSync(targetRoot, { recursive: true });
    mkdirSync(extractRoot);
    armDownloadTimeout(responseTimeoutMs, `Timed out waiting ${responseTimeoutMs} ms for the harness download response`);
    const response = await fetchImpl(info.assetUrl, {
      headers: { 'user-agent': 'free-code-deepseek-harness-updater' },
      signal: controller.signal,
    });
    clearDownloadTimeout();
    if (!response.ok) throw new Error(`Harness download returned HTTP ${response.status}`);
    if (!response.body) throw new Error('Harness download returned an empty response body');
    const digest = createHash('sha256');
    const headerLength = Number(response.headers.get('content-length'));
    const totalBytes = Number.isFinite(headerLength) && headerLength > 0 ? headerLength : undefined;
    const armIdleTimeout = (): void => {
      armDownloadTimeout(
        idleTimeoutMs,
        () => `Harness download stalled: no data received for ${idleTimeoutMs} ms (${receivedBytes} bytes received)`,
      );
    };
    armIdleTimeout();
    const meter = new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        digest.update(bytes);
        receivedBytes += bytes.length;
        armIdleTimeout();
        onProgress?.({ phase: 'download', receivedBytes, ...(totalBytes === undefined ? {} : { totalBytes }) });
        callback(null, bytes);
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
        meter,
        createWriteStream(archivePath, { flags: 'wx' }),
        { signal: controller.signal },
      );
    } finally {
      clearDownloadTimeout();
    }
    verifyDigest(digest.digest('hex'), info.digest);
    onProgress?.({ phase: 'extract' });
    const extracted = await launchHiddenAndWait({
      executable: resolveTarExecutable(),
      args: ['-xzf', archivePath, '-C', extractRoot],
      timeoutMs: 15 * 60_000,
    });
    if (extracted.exitCode !== 0) {
      throw new Error(`Could not extract harness runtime (exit ${extracted.exitCode ?? 'unknown'}${extracted.signal ? `, signal ${extracted.signal}` : ''})`);
    }

    const nextHarness = resolve(extractRoot, 'dsh');
    const nextManifest = resolve(extractRoot, 'runtime-manifest.json');
    validateHarnessRuntime(nextHarness, nextManifest, process.platform, requirements);
    promoteHarnessRuntime(
      nextHarness,
      nextManifest,
      targetRoot,
      (harnessDir, manifestPath) => validateHarnessRuntime(harnessDir, manifestPath, process.platform, requirements),
    );
  } catch (error) {
    if (timeoutError) throw timeoutError;
    throw error;
  } finally {
    clearDownloadTimeout();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function validateHarnessRuntime(
  harnessDir: string,
  manifestPath = join(dirname(harnessDir), 'runtime-manifest.json'),
  platform: NodeJS.Platform = process.platform,
  requirements?: HarnessRuntimeRequirements,
): void {
  const cliPath = join(harnessDir, 'apps', 'cli', 'lib', 'bin.js');
  if (!existsSync(cliPath)) throw new Error('Harness runtime is missing apps/cli/lib/bin.js');
  for (const dir of [join(harnessDir, 'packages'), join(harnessDir, 'node_modules')]) {
    if (!existsSync(dir) || readdirSync(dir).length === 0) throw new Error(`Harness runtime has an empty or missing directory: ${dir}`);
  }
  const packagePath = join(harnessDir, 'package.json');
  if (!existsSync(packagePath)) throw new Error('Harness runtime is missing package.json');
  const dshPackage = JSON.parse(readFileSync(packagePath, 'utf8')) as { engines?: { node?: unknown } };
  const engineRange = dshPackage.engines?.node;
  if (typeof engineRange !== 'string' || !semver.validRange(engineRange)) {
    throw new Error('Harness runtime package.json is missing or has an invalid engines.node');
  }
  if (!semver.valid(process.versions.node) || !semver.satisfies(process.versions.node, engineRange)) {
    throw new Error(`Node ${process.versions.node} does not satisfy DSH engines.node ${engineRange}`);
  }
  if (platform === 'win32') {
    const bridgeBundle = join(harnessDir, 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'index.js');
    if (!existsSync(bridgeBundle)) throw new Error('Harness runtime is missing the Windows directory-picker bridge bundle');
    const bridge = readFileSync(bridgeBundle, 'utf8');
    if (['FREECODE_DIALOG_BRIDGE_ENDPOINT', 'FREECODE_DIALOG_BRIDGE_TOKEN', 'x-freecode-dialog-token', 'fetch('].some((marker) => !bridge.includes(marker))) {
      throw new Error('Harness runtime Windows directory-picker bridge bundle is stale');
    }
  }
  if (!existsSync(manifestPath)) throw new Error('Harness runtime is missing runtime-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version?: unknown;
    cli?: unknown;
    nodeModuleVersion?: unknown;
  };
  if (typeof manifest.version !== 'string' || !semver.valid(manifest.version)) {
    throw new Error('Harness runtime manifest is missing a valid version');
  }
  if (manifest.cli !== 'dsh/apps/cli/lib/bin.js') {
    throw new Error('Harness runtime manifest points to an unexpected CLI');
  }
  if (typeof manifest.nodeModuleVersion !== 'string' || !/^\d+$/.test(manifest.nodeModuleVersion)) {
    throw new Error('Harness runtime manifest is missing a valid nodeModuleVersion');
  }
  const requiredModuleVersion = requirements?.nodeModuleVersion ?? process.versions.modules;
  if (requiredModuleVersion !== process.versions.modules) {
    throw new Error(`Electron NODE_MODULE_VERSION ${process.versions.modules} does not match packaged DSH ABI requirement ${requiredModuleVersion}`);
  }
  if (manifest.nodeModuleVersion !== requiredModuleVersion) {
    throw new Error(`Harness runtime native ABI ${manifest.nodeModuleVersion} does not match Electron NODE_MODULE_VERSION ${requiredModuleVersion}`);
  }
  assertHarnessRuntimeVersion(manifest.version, requirements?.minimumVersion);
  assertHeadlessDesktopRuntime(harnessDir, platform);
}

export function assertHarnessRuntimeVersion(version: string, minimumVersion?: string): void {
  if (!semver.valid(version)) throw new Error(`Harness runtime version is invalid: ${version}`);
  if (minimumVersion === undefined) return;
  if (!semver.valid(minimumVersion)) throw new Error(`Packaged DSH minimum version is invalid: ${minimumVersion}`);
  if (!semver.gte(version, minimumVersion)) {
    throw new Error(`Harness runtime version ${version} is below packaged minimum ${minimumVersion}`);
  }
}

/** Read and validate the tiny manifest embedded in the desktop package. */
export function readHarnessRuntimeRequirements(manifestPath: string): HarnessRuntimeRequirements {
  if (!existsSync(manifestPath)) throw new Error(`Packaged DSH runtime manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version?: unknown;
    nodeModuleVersion?: unknown;
  };
  if (typeof manifest.version !== 'string' || !semver.valid(manifest.version)) {
    throw new Error('Packaged DSH runtime manifest has no valid minimum version');
  }
  if (typeof manifest.nodeModuleVersion !== 'string' || !/^\d+$/.test(manifest.nodeModuleVersion)) {
    throw new Error('Packaged DSH runtime manifest has no valid nodeModuleVersion');
  }
  if (manifest.nodeModuleVersion !== process.versions.modules) {
    throw new Error(`Electron NODE_MODULE_VERSION ${process.versions.modules} does not match packaged DSH ABI requirement ${manifest.nodeModuleVersion}`);
  }
  return { minimumVersion: manifest.version, nodeModuleVersion: manifest.nodeModuleVersion };
}

function validateHarnessAssetUrl(assetUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(assetUrl);
  } catch {
    throw new Error('Harness update asset URL is invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    throw new Error('Harness update asset must use the configured HTTPS GitHub release host');
  }
}

function verifyDigest(actual: string, digest: string | undefined): void {
  if (!digest) throw new Error('Harness release asset is missing the required SHA-256 digest');
  const expected = digest.replace(/^sha256:/i, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Harness release asset SHA-256 digest is invalid');
  if (expected !== actual) throw new Error('Harness update digest does not match the release asset');
}
