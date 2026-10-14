import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export function runtimeWorkspace(include) {
  if (!Array.isArray(include) || include.length === 0 || !include.every(value => typeof value === 'string')) {
    throw new Error('vendor-runtime-build: upstream workspace must be a nonempty pattern array');
  }
  return { include, exclude: ['**/node_modules/**', '**/dist/**', '**/test?(s)/**', '**/t?(e)mp/**',
    '**/graphify-out', '**/graphify-out/**'] };
}

/** Reuse only a completed frozen, same-platform install; all build gates remain. */
export function canReuseVendorInstall(vendor, platform) {
  try {
    const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
    if (hash(join(vendor, 'pnpm-lock.yaml')) !== hash(join(vendor, 'node_modules/.pnpm/lock.yaml'))) return false;
    if (readFileSync(join(vendor, 'node_modules/.freecode-install-platform'), 'utf8').trim() !== platform) return false;
    return ['node_modules/.modules.yaml', 'node_modules/typescript/bin/tsc',
      'node_modules/tsdown/dist/run.mjs', 'node_modules/vite/bin/vite.js'].every(file => existsSync(join(vendor, file)));
  } catch { return false; }
}

async function main() {
  const root = resolve(import.meta.dirname, '..');
  const vendor = join(root, 'vendor/deepseek-harness');
  const face = process.argv[2];
  if (face === 'cache-check') {
    const platform = process.argv[3] ?? `${process.platform}:${process.arch}`;
    process.exitCode = canReuseVendorInstall(vendor, platform) ? 0 : 1;
    return;
  }
  if (face !== 'host' && face !== 'client') throw new Error('vendor-runtime-build: face must be host or client');
  if (!process.features.typescript) throw new Error('vendor-runtime-build: native TypeScript config loading is required');
  process.env.DSH_CLIENT_COMMIT_HASH ??= execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const configPath = join(vendor, 'tsdown.config.ts');
  const upstream = (await import(pathToFileURL(configPath).href)).default;
  const env = { DSH_BUILD_FACE: face };
  const base = typeof upstream === 'function' ? await upstream({ env }) : upstream;
  const { build } = await import(pathToFileURL(join(vendor, 'node_modules/tsdown/dist/index.mjs')).href);
  process.chdir(vendor);
  await build({ cwd: vendor, config: configPath, configLoader: 'native', env,
    workspace: runtimeWorkspace(base.workspace), report: false });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
