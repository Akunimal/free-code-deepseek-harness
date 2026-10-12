import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { resolveNsisSetup } from './nsis-smoke-setup.mjs';
import { interactiveNsisSmokeOptedIn } from './nsis-smoke-guard.mjs';

const repositoryRoot = new URL('../', import.meta.url);

test('NSIS setup selection uses exact package version, not lexical newest', () => {
  const releaseDir = mkdtempSync(join(tmpdir(), 'freecode-nsis-setup-test-'));
  try {
    for (const version of ['0.9.2', '0.9.3', '0.10.0']) {
      writeFileSync(join(releaseDir, `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`), 'MZ');
    }

    const selected = resolveNsisSetup({ releaseDir, version: '0.9.3' });
    assert.equal(basename(selected), 'FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe');
    assert.throws(() => resolveNsisSetup({
      releaseDir,
      version: '0.9.3',
      setupPath: join(releaseDir, 'FreeCode-DeepSeek-Harness-0.10.0-win-x64-setup.exe'),
    }), /does not match package version 0\.9\.3/);
  } finally {
    rmSync(releaseDir, { recursive: true, force: true });
  }
});

test('interactive NSIS smoke requires explicit disposable-VM opt-in', () => {
  assert.equal(interactiveNsisSmokeOptedIn({}), false);
  assert.equal(interactiveNsisSmokeOptedIn({ FREECODE_ALLOW_INTERACTIVE_NSIS_SMOKE: '1' }), false);
  assert.equal(interactiveNsisSmokeOptedIn({
    FREECODE_ALLOW_INTERACTIVE_NSIS_SMOKE: '1',
    FREECODE_NSIS_SMOKE_ENV: 'workstation',
  }), false);
  assert.equal(interactiveNsisSmokeOptedIn({
    FREECODE_ALLOW_INTERACTIVE_NSIS_SMOKE: '1',
    FREECODE_NSIS_SMOKE_ENV: 'disposable-vm',
  }), true);
});

test('NSIS hooks never kill every process by image name', () => {
  const installer = readFileSync(new URL('apps/shell/build/installer.nsh', repositoryRoot), 'utf8');
  const patcher = readFileSync(new URL('apps/shell/build/patch-nsis.cjs', repositoryRoot), 'utf8');

  assert.doesNotMatch(installer, /taskkill(?:\.exe)?\s+\/F\s+\/IM\b/i);
  assert.doesNotMatch(patcher, /taskkill(?:\.exe)?\s+\/F\s+\/IM\b/i);
  assert.match(installer, /FREECODE_NSIS_TARGET_EXE/);
  assert.match(installer, /ExecutablePath/);
  assert.match(patcher, /path-scoped/i);
});
