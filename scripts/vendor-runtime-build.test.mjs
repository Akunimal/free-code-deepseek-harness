import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runtimeWorkspace, canReuseVendorInstall } from './vendor-runtime-build.mjs';

test('runtime workspace preserves real packages but excludes graph artifacts from package globs', () => {
  const workspace = runtimeWorkspace(['vendor/*', 'packages/*/*', 'apps/cli']);
  assert.deepEqual(workspace.include, ['vendor/*', 'packages/*/*', 'apps/cli']);
  assert.ok(workspace.exclude.includes('**/graphify-out/**'));
  assert.ok(workspace.exclude.includes('**/node_modules/**'));
  assert.throws(() => runtimeWorkspace(undefined));
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
