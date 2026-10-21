import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchHiddenSync } from './freecode-launcher.js'

export interface ResourcePathOptions {
  packaged: boolean;
  resourcesPath?: string;
  developmentRoot?: string;
}

/** Resolve the static resources root that contains Phoenix and other sidecars. */
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
  /** Static resources directory containing Phoenix and OCR. */
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

/** Find the platform worker binary in both the legacy dev layout and the
 * packaged layout. Keeping this compatibility layer makes old checkouts and
 * fresh package-runtime stages runnable during the transition. */
export function resolvePhoenixDirectory(resourcesDir: string): string {
  return resolve(resourcesDir, 'phoenix');
}

export function resolvePhoenixBinary(resourcesDir: string): string {
  return resolve(resolvePhoenixDirectory(resourcesDir), 'freellmpool-win-x64.exe');
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
