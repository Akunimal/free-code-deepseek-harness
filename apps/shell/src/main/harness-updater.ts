import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

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
  check(): Promise<HarnessUpdateInfo>;
  downloadAndInstall(info: HarnessUpdateInfo): Promise<void>;
}

interface GitHubReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
  digest?: unknown;
}

interface GitHubRelease {
  tag_name?: unknown;
  assets?: unknown;
}

const DEFAULT_REPO = 'Akunimal/free-code-deepseek-harness';

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
): Promise<HarnessUpdateInfo> {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'free-code-deepseek-harness-updater',
      },
    });
    if (!response.ok) throw new Error(`GitHub harness release check returned HTTP ${response.status}`);
    const release = (await response.json()) as GitHubRelease;
    const releaseVersion = typeof release.tag_name === 'string'
      ? release.tag_name.replace(/^v/i, '')
      : undefined;
    const expected = releaseVersion === undefined ? undefined : harnessAssetName(releaseVersion, platform, arch);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const candidates = assets
      .map((candidate) => candidate as GitHubReleaseAsset)
      .filter((candidate) => typeof candidate.name === 'string' && typeof candidate.browser_download_url === 'string');
    const platformName = harnessPlatform(platform);
    const suffix = `-${platformName}-${arch}.tar.gz`;
    const asset = candidates.find((candidate) => candidate.name === expected)
      ?? candidates.find((candidate) => (candidate.name as string).startsWith('deepseek-harness-runtime-') && (candidate.name as string).endsWith(suffix));
    const assetName = typeof asset?.name === 'string' ? asset.name : undefined;
    const assetUrl = typeof asset?.browser_download_url === 'string' ? asset.browser_download_url : undefined;
    const digest = typeof asset?.digest === 'string' ? asset.digest : undefined;
    const latestVersion = assetName?.match(/^deepseek-harness-runtime-(.+)-[^-]+-[^-]+\.tar\.gz$/)?.[1] ?? releaseVersion;
    return {
      currentVersion,
      latestVersion,
      ...(assetName === undefined ? {} : { assetName }),
      ...(assetUrl === undefined ? {} : { assetUrl }),
      ...(digest === undefined ? {} : { digest }),
      available: Boolean(currentVersion && latestVersion && currentVersion !== latestVersion && assetUrl),
      ...(latestVersion && !assetUrl ? { error: `No compatible harness asset for ${latestVersion}` } : {}),
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
    check: () => checkHarnessRelease(options.currentVersion, platform, arch, fetchImpl, options.repo),
    downloadAndInstall: (info) => installHarnessRuntime(info, options.resourcesDir, fetchImpl),
  };
}

export async function installHarnessRuntime(
  info: HarnessUpdateInfo,
  resourcesDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!info.assetUrl) throw new Error('Harness update has no compatible runtime asset');
  const tempRoot = mkdtempSync(join(tmpdir(), 'freecode-harness-update-'));
  const archivePath = join(tempRoot, info.assetName ?? 'harness.tar.gz');
  const extractRoot = join(tempRoot, 'extract');
  try {
    mkdirSync(extractRoot);
    const response = await fetchImpl(info.assetUrl, {
      headers: { 'user-agent': 'free-code-deepseek-harness-updater' },
    });
    if (!response.ok) throw new Error(`Harness download returned HTTP ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    verifyDigest(archive, info.digest);
    writeFileSync(archivePath, archive);
    const extracted = spawnSync('tar', ['-xzf', archivePath, '-C', extractRoot], {
      stdio: 'ignore',
      windowsHide: process.platform === 'win32',
    });
    if (extracted.status !== 0) throw new Error(`Could not extract harness runtime (exit ${extracted.status ?? 'unknown'})`);

    const nextHarness = resolve(extractRoot, 'dsh');
    const nextManifest = resolve(extractRoot, 'runtime-manifest.json');
    validateHarnessRuntime(nextHarness, nextManifest);
    const currentHarness = resolve(resourcesDir, 'dsh');
    if (!existsSync(currentHarness)) throw new Error(`Current harness runtime not found: ${currentHarness}`);
    if (!existsSync(nextManifest)) throw new Error('Harness runtime is missing runtime-manifest.json');
    const backupHarness = resolve(resourcesDir, `.dsh-backup-${process.pid}-${Date.now()}`);
    const currentManifest = resolve(resourcesDir, 'runtime-manifest.json');
    const backupManifest = resolve(resourcesDir, `.runtime-manifest-backup-${process.pid}-${Date.now()}`);

    renameSync(currentHarness, backupHarness);
    if (existsSync(currentManifest)) renameSync(currentManifest, backupManifest);
    try {
      renameSync(nextHarness, currentHarness);
      renameSync(nextManifest, currentManifest);
      validateHarnessRuntime(currentHarness, currentManifest);
      rmSync(backupHarness, { recursive: true, force: true });
      rmSync(backupManifest, { force: true });
    } catch (error) {
      if (existsSync(currentHarness)) rmSync(currentHarness, { recursive: true, force: true });
      if (existsSync(backupHarness)) renameSync(backupHarness, currentHarness);
      if (existsSync(currentManifest)) rmSync(currentManifest, { force: true });
      if (existsSync(backupManifest)) renameSync(backupManifest, currentManifest);
      throw error;
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function validateHarnessRuntime(harnessDir: string, manifestPath = join(harnessDir, 'runtime-manifest.json')): void {
  const cliPath = join(harnessDir, 'apps', 'cli', 'lib', 'bin.js');
  if (!existsSync(cliPath)) throw new Error('Harness runtime is missing apps/cli/lib/bin.js');
  if (!existsSync(manifestPath)) throw new Error('Harness runtime is missing runtime-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { cli?: unknown };
  if (manifest.cli !== undefined && manifest.cli !== 'dsh/apps/cli/lib/bin.js') {
    throw new Error('Harness runtime manifest points to an unexpected CLI');
  }
}

function verifyDigest(archive: Buffer, digest: string | undefined): void {
  if (!digest) return;
  const expected = digest.replace(/^sha256:/i, '').toLowerCase();
  const actual = createHash('sha256').update(archive).digest('hex');
  if (expected !== actual) throw new Error('Harness update digest does not match the release asset');
}
