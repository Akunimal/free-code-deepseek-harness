import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyOverlappingAppliedPatches } from '../../../scripts/patch-stack-replay.mjs';

const roots: string[] = [];
const vendorPrefix = 'vendor/fake/';
const firstPatch = `diff --git a/vendor/fake/config.txt b/vendor/fake/config.txt
index 1111111..2222222 100644
--- a/vendor/fake/config.txt
+++ b/vendor/fake/config.txt
@@ -1,3 +1,3 @@
 alpha
-beta
+beta-one
 omega
`;
const secondPatch = `diff --git a/vendor/fake/config.txt b/vendor/fake/config.txt
index 2222222..3333333 100644
--- a/vendor/fake/config.txt
+++ b/vendor/fake/config.txt
@@ -1,3 +1,3 @@
 alpha
-beta-one
+beta-two
 omega
`;

function fixture(content: string) {
  const root = mkdtempSync(join(tmpdir(), 'freecode-patch-replay-test-'));
  roots.push(root);
  const patchDir = join(root, 'patches');
  const target = join(root, 'vendor/fake/config.txt');
  mkdirSync(join(root, 'vendor/fake'), { recursive: true });
  mkdirSync(patchDir, { recursive: true });
  writeFileSync(target, content);
  writeFileSync(join(patchDir, '001-first.patch'), firstPatch);
  writeFileSync(join(patchDir, '002-second.patch'), secondPatch);
  return {
    root,
    patchDir,
    patches: [{ file: '001-first.patch', order: 1 }, { file: '002-second.patch', order: 2 }],
    target,
  };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('stack-aware patch replay', () => {
  it('keeps the model-route patch reversible against the checked-in vendor snapshot', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const patchDir = join(root, 'patches/upstream');
    const manifest = JSON.parse(readFileSync(join(patchDir, 'upstream-patches.json'), 'utf8'));
    expect(manifest.patches.find((entry: { file: string }) => entry.file === '174-freecode-model-route-selection-ack.patch'))
      .toMatchObject({ order: 174 });
    const result = verifyOverlappingAppliedPatches({
      root,
      patchDir,
      patches: manifest.patches,
      vendorPrefix: manifest.vendorPrefix,
    });
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  });

  it('validates overlapping patches by reversing and replaying the ordered stack', () => {
    const f = fixture('alpha\nbeta-two\nomega\n');
    const result = verifyOverlappingAppliedPatches({ root: f.root, patchDir: f.patchDir, patches: f.patches, vendorPrefix });
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    expect(readFileSync(f.target, 'utf8')).toBe('alpha\nbeta-two\nomega\n');
  });

  it('rejects a locally diverged file without changing it', () => {
    const f = fixture('alpha\nmanual-edit\nomega\n');
    expect(verifyOverlappingAppliedPatches({ root: f.root, patchDir: f.patchDir, patches: f.patches, vendorPrefix }))
      .toMatchObject({ ok: false });
    expect(readFileSync(f.target, 'utf8')).toBe('alpha\nmanual-edit\nomega\n');
  });
});
