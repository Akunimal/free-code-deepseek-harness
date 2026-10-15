import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runtimeWorkspace, canReuseVendorInstall, buildRuntimePackages } from './vendor-runtime-build.mjs';

test('runtime workspace preserves real packages but excludes graph artifacts from package globs', () => {
  const workspace = runtimeWorkspace(['vendor/*', 'packages/*/*', 'apps/cli']);
  assert.deepEqual(workspace.include, ['vendor/*', 'packages/*/*', 'apps/cli']);
  assert.ok(workspace.exclude.includes('**/graphify-out/**'));
  assert.ok(workspace.exclude.includes('**/node_modules/**'));
  assert.throws(() => runtimeWorkspace(undefined));
});

test('runtime packaging checks both real compiler faces rather than suppressing diagnostics', () => {
  const script = readFileSync(new URL('package-runtime.sh', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /--noCheck/);
  assert.match(script, /tsc -b tsconfig\.host\.json/);
  assert.match(script, /tsc -b tsconfig\.client\.json/);
});
test('dependency cache reuse requires exact frozen lock, target platform and build-tool entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-vendor-cache-'));
  const put = (name, value = 'fixture') => { const file = join(root, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); };
  try {
    assert.equal(canReuseVendorInstall(root, 'win32:x64'), false);
    for (const file of ['pnpm-lock.yaml', 'node_modules/.pnpm/lock.yaml', 'node_modules/.modules.yaml',
      'node_modules/typescript/bin/tsc', 'node_modules/tsdown/dist/run.mjs', 'node_modules/vite/bin/vite.js']) put(file);
    put('node_modules/.freecode-install-platform', 'win32:x64\n');
    assert.equal(canReuseVendorInstall(root, 'win32:x64'), true);
    assert.equal(canReuseVendorInstall(root, 'linux:x64'), false);
    put('pnpm-lock.yaml', 'changed');
    assert.equal(canReuseVendorInstall(root, 'win32:x64'), false);
    put('node_modules/.pnpm/lock.yaml', 'changed');
    rmSync(join(root, 'node_modules/tsdown/dist/run.mjs'));
    assert.equal(canReuseVendorInstall(root, 'win32:x64'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runtime bundling bounds concurrent work while preserving every package and one shared Typert plugin', async () => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-bounded-build-'));
  try {
    for (let i = 0; i < 11; i++) {
      const dir = join(root, `packages/group/pkg-${i}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), '{}');
    }
    mkdirSync(join(root, 'packages/group/graphify-out'), { recursive: true });
    writeFileSync(join(root, 'packages/group/graphify-out/package.json'), '{}');
    const plugin = { name: 'shared-typert-fixture' };
    let active = 0, max = 0;
    const packages = [];
    await buildRuntimePackages({ vendor: root, base: { workspace: ['packages/group/*'], plugins: [plugin] }, env: {},
      build: async config => {
        max = Math.max(max, ++active);
        assert.equal(config.config, false);
        assert.equal(config.plugins[0], plugin);
        assert.ok(config.workspace.include.length <= 4);
        assert.ok(config.workspace.include.every(path => !path.includes('\\')), 'glob paths must be portable on Windows');
        packages.push(...config.workspace.include);
        await new Promise(resolve => setTimeout(resolve, 1));
        active--;
      },
    });
    assert.equal(max, 1, 'each batch must finish before the next starts');
    assert.equal(new Set(packages).size, 11);
    assert.ok(!packages.some(path => path.includes('graphify-out')));
    let emptyCalls = 0;
    await buildRuntimePackages({ vendor: root, base: { workspace: ['packages/group/*'] }, env: {},
      build: async () => { if (++emptyCalls === 1) throw new Error('No valid configuration found.'); },
    });
    assert.equal(emptyCalls, 3, 'an intentionally empty Host/Client face must not prevent later batches');
    await assert.rejects(buildRuntimePackages({ vendor: root, base: { workspace: ['packages/group/*'] }, env: {},
      build: async () => { throw new Error('real bundler failure'); },
    }), /real bundler failure/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
