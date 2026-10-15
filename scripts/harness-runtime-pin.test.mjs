import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
test('runtime packaging pins an independent fork version, never the upstream package version', () => {
  const pinPath = join(root, 'apps/shell/harness-runtime.json');
  assert.equal(existsSync(pinPath), true, 'runtime version needs a tracked reproducible source pin');
  const pin = JSON.parse(readFileSync(pinPath, 'utf8'));
  assert.equal(pin.version, '0.2.1-alpha.6', 'Hermes and live profile fixes require a new immutable runtime');
  const staged = JSON.parse(readFileSync(join(root, 'apps/shell/resources/freecode/runtime-manifest.json'), 'utf8'));
  assert.equal(staged.version, pin.version, 'the desktop stage must require the same DSH alpha version as the shell pin');
  const script = readFileSync(join(root, 'scripts/package-runtime.sh'), 'utf8');
  assert.ok(script.includes('apps/shell/harness-runtime.json'));
  assert.ok(!script.includes('version: require(vendorPackagePath).version'));
});

test('manifest gate rejects a stale stage that disagrees with the source pin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'freecode-runtime-pin-'));
  try {
    const manifest = join(dir, 'manifest.json');
    const pin = join(dir, 'pin.json');
    writeFileSync(pin, '{"version":"0.2.1-alpha.5"}');
    writeFileSync(manifest, JSON.stringify({ version: '0.2.1-alpha.4', nodeModuleVersion: '149',
      cli: 'dsh/apps/cli/lib/bin.js', install: 'core-allowlist', optionalProviders: 'external-only' }));
    const result = spawnSync(process.execPath, [join(root, 'scripts/verify-runtime-manifest.mjs'), manifest, pin], { encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /pin/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
