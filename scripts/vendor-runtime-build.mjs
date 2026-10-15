import { createHash } from 'node:crypto';
import { existsSync, globSync, readFileSync } from 'node:fs';
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

/** Avoid retaining hundreds of Rolldown graphs beside Typert's compiler model. */
export async function buildRuntimePackages({ vendor, base, env, build }) {
  const workspace = runtimeWorkspace(base.workspace);
  const packages = [...globSync(workspace.include, { cwd: vendor, exclude: workspace.exclude })]
    .filter(path => existsSync(join(vendor, path, 'package.json')))
    .map(path => path.replaceAll('\\', '/'))
    .sort((a, b) => a.localeCompare(b, 'en'));
  if (packages.length === 0) throw new Error('vendor-runtime-build: no workspace packages');
  for (let offset = 0; offset < packages.length; offset += 4) {
    const include = packages.slice(offset, offset + 4);
    console.log(`vendor-runtime-build: batch ${offset + 1}-${offset + include.length}/${packages.length}`);
    // Resolve the root config once. In particular the shared Typert plugin's
    // emit-once state must survive batches. Workspace-local configs still load
    // normally through workspace.config; no artifacts or checks are skipped.
    try {
      await build({ ...base, cwd: vendor, config: false, env,
        workspace: { ...workspace, include }, report: false });
    } catch (error) {
      // Package-local configs deliberately disable the other face. A batch
      // consisting solely of those configs has no build (the combined upstream
      // pass filters the same entries). Never swallow a real build failure.
      if (!(error instanceof Error) || error.message !== 'No valid configuration found.') throw error;
      console.log('vendor-runtime-build: this batch has no entries for the selected face');
    }
  }
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
  await buildRuntimePackages({ vendor, base, env, build });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
