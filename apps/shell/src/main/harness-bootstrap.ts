import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateHarnessRuntime,
  type HarnessDownloadProgressHandler,
  type HarnessUpdaterAdapter,
} from './harness-updater.js';

export interface EnsureHarnessRuntimeOptions {
  /** Writable per-user runtime root containing dsh/ and runtime-manifest.json. */
  resourcesDir: string;
  updater: HarnessUpdaterAdapter;
  platform?: NodeJS.Platform;
  onProgress?: HarnessDownloadProgressHandler;
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
  const existingVersion = readValidatedRuntimeVersion(harnessDir, manifestPath, platform);
  if (existingVersion) return { status: 'ready', version: existingVersion, source: 'existing' };

  const update = await options.updater.check();
  if (!update.available || !update.latestVersion || !update.assetUrl) {
    throw new Error(update.error ?? 'No compatible DSH runtime release is available');
  }
  if (!update.digest) throw new Error('The DSH runtime release did not provide a SHA-256 digest');

  await options.updater.downloadAndInstall(update, options.onProgress);
  // Preserve the specific compatibility/layout error so the user can decide
  // whether retrying the first-run download is likely to help.
  validateHarnessRuntime(harnessDir, manifestPath, platform);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
  const installedVersion = typeof manifest.version === 'string' ? manifest.version : undefined;
  if (!installedVersion) throw new Error('Downloaded DSH runtime manifest has no version');
  return { status: 'ready', version: installedVersion, source: 'downloaded' };
}

function readValidatedRuntimeVersion(
  harnessDir: string,
  manifestPath: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (!existsSync(harnessDir) || !existsSync(manifestPath)) return undefined;
  try {
    validateHarnessRuntime(harnessDir, manifestPath, platform);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}
