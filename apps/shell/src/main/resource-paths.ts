import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface ResourcePathOptions {
  packaged: boolean;
  resourcesPath?: string;
  developmentRoot?: string;
}

/** Resolve the root that contains `dsh/` and `opencode2api/`. */
export function resolveResourcesDir(options: ResourcePathOptions): string {
  if (options.packaged && options.resourcesPath) {
    const bundled = resolve(options.resourcesPath, 'freecode');
    if (existsSync(bundled)) return bundled;
  }
  return options.developmentRoot ?? resolve(import.meta.dirname, '../../../resources');
}

/** Find the platform worker binary in both the legacy dev layout and the
 * packaged layout. Keeping this compatibility layer makes old checkouts and
 * fresh package-runtime stages runnable during the transition. */
export function resolveOpencodeBinary(resourcesDir: string, platform: NodeJS.Platform): string {
  const name = platform === 'win32'
    ? 'opencode2api-win-x64.exe'
    : platform === 'darwin'
      ? 'opencode2api-mac-arm64'
      : 'opencode2api-linux-x64';
  const candidates = [
    resolve(resourcesDir, 'opencode2api', name),
    resolve(resourcesDir, name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
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
  const result = spawnSync(platform === 'win32' ? 'where' : 'which', ['node'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const first = result.stdout.split(/\r?\n/)[0]?.trim();
  return first || 'node';
}

export function nodeRuntimeEnv(packaged: boolean): Record<string, string> {
  return packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {};
}
