import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyOpencodePatches } from './apply-opencode2api-patches.mjs';

test('sidecar overlay replays on a pristine snapshot, is idempotent, rejects drift', () => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-sidecar-patch-'));
  try {
    const directory = join(root, 'vendor/opencode2api/internal/protocol');
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'fixture.go');
    writeFileSync(file, 'before\n');
    const patch = join(root, 'fixture.patch');
    writeFileSync(patch, '--- a/vendor/opencode2api/internal/protocol/fixture.go\n+++ b/vendor/opencode2api/internal/protocol/fixture.go\n@@ -1 +1 @@\n-before\n+after\n');
    const git = spawnSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
    assert.equal(git.status, 0);
    assert.equal(applyOpencodePatches(root, [patch])[0], 'applied');
    assert.equal(readFileSync(file, 'utf8'), 'after\n');
    assert.equal(applyOpencodePatches(root, [patch])[0], 'already applied');
    writeFileSync(file, 'unrelated change\n');
    assert.throws(() => applyOpencodePatches(root, [patch]), /diverged/);
    assert.equal(readFileSync(file, 'utf8'), 'unrelated change\n');
    writeFileSync(patch, '--- a/outside.txt\n+++ b/outside.txt\n@@ -1 +1 @@\n-before\n+after\n');
    assert.throws(() => applyOpencodePatches(root, [patch]), /outside vendor/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('sidecar build materializes its current fork overlay before compilation', () => {
  const build = readFileSync(new URL('./build-opencode2api.sh', import.meta.url), 'utf8');
  assert.match(build, /node "\$ROOT\/scripts\/apply-opencode2api-patches\.mjs"/);
  assert.ok(build.indexOf('apply-opencode2api-patches.mjs') < build.indexOf('build_target windows'));
});

test('the actual pash overlay replays on tracked upstream files without direct vendor commits', () => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-sidecar-replay-'));
  const repository = new URL('..', import.meta.url);
  try {
    const patch = new URL('../patches/opencode2api-pash-tool-name.patch', import.meta.url);
    for (const name of ['gateway.go', 'rotation.go']) {
      const relative = 'vendor/opencode2api/internal/gateway/' + name;
      const original = spawnSync('git', ['show', 'HEAD:' + relative], {
        cwd: repository, encoding: 'utf8', windowsHide: true,
      });
      assert.equal(original.status, 0, original.stderr);
      mkdirSync(join(root, 'vendor/opencode2api/internal/gateway'), { recursive: true });
      writeFileSync(join(root, relative), original.stdout);
    }
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true }).status, 0);
    assert.equal(applyOpencodePatches(root, [fileURLToPath(patch)])[0], 'applied');
    assert.equal(applyOpencodePatches(root, [fileURLToPath(patch)])[0], 'already applied');
    assert.match(readFileSync(join(root, 'vendor/opencode2api/internal/protocol/freecode_tool_name.go'), 'utf8'), /func NewToolNameRepair/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
