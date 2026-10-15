import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { resolveNsisSetup } from './nsis-smoke-setup.mjs';
import { interactiveNsisSmokeOptedIn } from './nsis-smoke-guard.mjs';
import { createInstalledSmokeEnvironment } from './installed-runtime-environment.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const { guardStrContainsInclude } = require('../apps/shell/build/patch-nsis.cjs');

test('NSIS uninstaller compilation skips the installer-only StrContains function', () => {
  const unpatched = '!include "common.nsh"\n!include "StrContains.nsh"\nSection\nSectionEnd\n';
  const guarded = guardStrContainsInclude(unpatched);

  assert.match(guarded, /!ifndef BUILD_UNINSTALLER\r?\n!include "StrContains\.nsh"\r?\n!endif/);
  assert.equal(guardStrContainsInclude(guarded), guarded, 'patch must be idempotent');

  const existingCrlf = '!include "common.nsh"\r\n!include "StrContains.nsh"\r\nSection\r\nSectionEnd\r\n';
  const migratedCrlf = guardStrContainsInclude(existingCrlf);
  assert.match(migratedCrlf, /!ifndef BUILD_UNINSTALLER\r\n!include "StrContains\.nsh"\r\n!endif/);
  assert.equal(guardStrContainsInclude(migratedCrlf), migratedCrlf, 'CRLF template migration must be idempotent');

  const absent = guardStrContainsInclude('!include "common.nsh"\r\nSection\r\nSectionEnd\r\n');
  assert.match(absent, /!ifndef BUILD_UNINSTALLER\r?\n!include "StrContains\.nsh"\r?\n!endif/);
  assert.match(absent, /!include "common\.nsh"\r?\n!ifndef BUILD_UNINSTALLER/);
});

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

test('ordinary installs reject persisted smoke paths while the smoke child receives an exact-target exception', () => {
  const patcher = readFileSync(new URL('../apps/shell/build/patch-nsis.cjs', import.meta.url), 'utf8');
  const smoke = readFileSync(new URL('verify-nsis-install-layout.mjs', import.meta.url), 'utf8');

  assert.match(patcher, /StrContains\.nsh/);
  assert.match(patcher, /\$\{StrContains\}\s+\$R\d+\s+"freecode-nsis-smoke-"\s+"\$INSTDIR"/);
  assert.match(patcher, /ReadEnvStr\s+\$R\d+\s+"FREECODE_NSIS_SMOKE_INSTALL_DIR"/);
  assert.match(patcher, /StrCmp\s+\$R\d+\s+"\$INSTDIR"\s+_freecodeInstDirCheckAbsolute/);
  const generatedGuard = patcher.slice(patcher.indexOf('const block = ['), patcher.indexOf("].join('\\n');", patcher.indexOf('const block = [')));
  assert.doesNotMatch(generatedGuard, /\$%FREECODE_NSIS_SMOKE_INSTALL_DIR%/);
  assert.match(smoke, /FREECODE_NSIS_SMOKE_INSTALL_DIR:\s*installDir/);
});

test('installed app smoke redirects all user-scoped writes into the disposable install directory', () => {
  const installDir = 'C:\\Temp\\freecode-nsis-smoke-test';
  const environment = createInstalledSmokeEnvironment(installDir, {
    APPDATA: 'C:\\Users\\real-user\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\real-user\\AppData\\Local',
    PATH: 'C:\\Windows\\System32',
  });

  assert.equal(environment.userDataDir, 'C:\\Temp\\freecode-nsis-smoke-test\\.release-smoke-profile\\Roaming\\@freecode\\shell');
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'TEMP', 'TMP']) {
    assert.ok(environment.env[key].startsWith('C:\\Temp\\freecode-nsis-smoke-test\\'), `${key} must stay in test install`);
  }
  assert.equal(environment.env.PATH, 'C:\\Windows\\System32');
});

test('installed runtime smoke launches with its isolated environment, not the maintainer profile', () => {
  const runtimeVerifier = readFileSync(new URL('verify-installed-runtime.mjs', import.meta.url), 'utf8');
  assert.match(runtimeVerifier, /createInstalledSmokeEnvironment/);
  assert.match(runtimeVerifier, /env:\s*environment\.env/);
  assert.match(runtimeVerifier, /--user-data-dir=\$\{environment\.userDataDir\}/);
});
