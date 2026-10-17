import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchHiddenSync } from './freecode-launcher.js'

export interface ResourcePathOptions {
  packaged: boolean;
  resourcesPath?: string;
  developmentRoot?: string;
}

/** Resolve the static resources root that contains `opencode2api/` and sidecars. */
export function resolveResourcesDir(options: ResourcePathOptions): string {
  if (options.packaged && options.resourcesPath) {
    const bundled = resolve(options.resourcesPath, 'freecode');
    if (existsSync(bundled)) return bundled;
  }
  const base = options.developmentRoot ?? resolve(import.meta.dirname, '../../../resources');
  // In dev mode the freecode/ subdirectory mirrors the packaged layout.
  const freecode = resolve(base, 'freecode');
  if (existsSync(freecode)) return freecode;
  return base;
}

export interface HarnessRuntimePathOptions {
  packaged: boolean;
  /** Static resources directory containing opencode2api, OCR, and Tor. */
  resourcesDir: string;
  /** Writable app data directory; packaged harness downloads live here. */
  userDataDir?: string;
}

/**
 * Packaged DSH is downloaded at first launch, so it must not be written under
 * Program Files. Development continues to use the checked-out resource tree.
 */
export function resolveHarnessRuntimeDir(options: HarnessRuntimePathOptions): string {
  if (!options.packaged) return resolve(options.resourcesDir);
  if (!options.userDataDir) throw new Error('Packaged DSH runtime requires a writable user data directory');
  return resolve(options.userDataDir, 'harness-runtime');
}

export interface NodePathOptions {
  packaged: boolean;
  explicit?: string;
  executablePath?: string;
  platform?: NodeJS.Platform;
}

/** Resolve the child runtime. Packaged Electron must be launched as Node via
 * ELECTRON_RUN_AS_NODE; development keeps using the system Node executable. */
export function resolveNodePath(options: NodePathOptions): string {
  if (options.explicit) return options.explicit;
  if (options.packaged) return options.executablePath ?? process.execPath;
  const platform = options.platform ?? process.platform;
  const result = launchHiddenSync({
    executable: platform === 'win32' ? 'where' : 'which',
    args: ['node'],
    encoding: 'utf8',
    timeout: 10_000,
  });
  const stdout = typeof result.stdout === 'string' ? result.stdout : ''
  const first = stdout.split(/\r?\n/)[0]?.trim();
  return first || 'node';
}

export function nodeRuntimeEnv(packaged: boolean): Record<string, string> {
  return packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {};
}
