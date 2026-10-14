import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanShellDist } from './clean-shell-dist.mjs';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
test('product has no optional OmniRoute launch, download, detector or package input', () => {
  for (const file of ['apps/shell/src/main/runtime.ts', 'apps/shell/src/main/index.ts',
    'apps/shell/src/main/ipc.ts', 'apps/shell/src/preload/index.ts', 'packages/shared-types/src/index.ts']) {
    assert.doesNotMatch(read(file), /OmniRoute|omnirouteDetect|omnirouteBootstrap|startOmniRoute|ModelFallback/);
  }
  for (const file of ['apps/shell/omniroute-runtime/package.json', 'apps/shell/src/main/omniroute.ts',
    'apps/shell/src/main/omniroute-bootstrap.ts', 'apps/shell/src/main/omniroute-detector.ts',
    'scripts/prepare-omniroute-runtime.mjs', 'scripts/verify-omniroute-runtime.mjs']) assert.equal(existsSync(new URL(file, root)), false, file);
  const pkg = JSON.parse(read('apps/shell/package.json'));
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /omniroute-runtime/);
  const builder = read('apps/shell/electron-builder.yml');
  assert.doesNotMatch(builder, /from:.*omniroute/);
  assert.match(builder, /!omniroute-runtime/); // stale generated manifests cannot re-enter the payload
});

test('a clean shell build cannot ship stale retired JavaScript and refuses junction cleanup', () => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-output-test-'));
  const outside = mkdtempSync(join(tmpdir(), 'freecode-output-outside-'));
  try {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'omniroute.js'), 'stale');
    cleanShellDist(root);
    assert.equal(existsSync(join(root, 'dist')), false);
    writeFileSync(join(outside, 'keep'), 'outside');
    symlinkSync(outside, join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => cleanShellDist(root), /symlink|junction/);
    assert.equal(readFileSync(join(outside, 'keep'), 'utf8'), 'outside');
    assert.match(JSON.parse(read('apps/shell/package.json')).scripts.build, /^node .*clean-shell-dist\.mjs && tsc/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
