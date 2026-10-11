import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertHarnessRuntimeVersion,
  validateHarnessRuntime,
  type HarnessDownloadProgressHandler,
  type HarnessRuntimeRequirements,
  type HarnessUpdaterAdapter,
} from './harness-updater.js';

export interface EnsureHarnessRuntimeOptions {
  /** Writable per-user runtime root containing dsh/ and runtime-manifest.json. */
  resourcesDir: string;
  updater: HarnessUpdaterAdapter;
  platform?: NodeJS.Platform;
  onProgress?: HarnessDownloadProgressHandler;
  requirements?: HarnessRuntimeRequirements;
}

export interface EnsureHarnessRuntimeResult {
  status: 'ready';
  version: string;
  source: 'existing' | 'downloaded';
}

/**
 * Reuse a complete installed runtime without touching the network. On a fresh
 * install or damaged cache, fetch and validate a signed-by-release-digest asset
 * before allowing the caller to start DSH.
 */
export async function ensureHarnessRuntime(
  options: EnsureHarnessRuntimeOptions,
): Promise<EnsureHarnessRuntimeResult> {
  const manifestPath = join(options.resourcesDir, 'runtime-manifest.json');
  const harnessDir = join(options.resourcesDir, 'dsh');
  const platform = options.platform ?? process.platform;
  if (options.requirements?.nodeModuleVersion !== undefined &&
      options.requirements.nodeModuleVersion !== process.versions.modules) {
    throw new Error(`Electron NODE_MODULE_VERSION ${process.versions.modules} does not match packaged DSH ABI requirement ${options.requirements.nodeModuleVersion}`);
  }
  const existingVersion = readValidatedRuntimeVersion(harnessDir, manifestPath, platform, options.requirements);
  if (existingVersion) return { status: 'ready', version: existingVersion, source: 'existing' };

  // Download the DSH source version paired with this shell's ABI manifest. A
  // floating latest release can be older (or built for a different ABI).
  const update = await options.updater.check(options.requirements?.minimumVersion);
  if (!update.available || !update.latestVersion || !update.assetUrl) {
    throw new Error(update.error ?? 'No compatible DSH runtime release is available');
  }
  assertHarnessRuntimeVersion(update.latestVersion, options.requirements?.minimumVersion);
  if (!update.digest) throw new Error('The DSH runtime release did not provide a SHA-256 digest');

  if (options.requirements) {
    await options.updater.downloadAndInstall(update, options.onProgress, options.requirements);
  } else {
    await options.updater.downloadAndInstall(update, options.onProgress);
  }
  // Preserve the specific compatibility/layout error so the user can decide
  // whether retrying the first-run download is likely to help.
  validateHarnessRuntime(harnessDir, manifestPath, platform, options.requirements);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
  const installedVersion = typeof manifest.version === 'string' ? manifest.version : undefined;
  if (!installedVersion) throw new Error('Downloaded DSH runtime manifest has no version');
  return { status: 'ready', version: installedVersion, source: 'downloaded' };
}

function readValidatedRuntimeVersion(
  harnessDir: string,
  manifestPath: string,
  platform: NodeJS.Platform,
  requirements?: HarnessRuntimeRequirements,
): string | undefined {
  if (!existsSync(harnessDir) || !existsSync(manifestPath)) return undefined;
  try {
    validateHarnessRuntime(harnessDir, manifestPath, platform, requirements);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}
