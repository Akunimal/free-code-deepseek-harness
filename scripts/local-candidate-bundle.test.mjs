import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { writeLocalCandidateBundle } from './local-candidate-bundle.mjs';

test('local candidate preflight verifies exact artifacts without installation or cache writes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'freecode-local-candidate-'));
  try {
    const version = '0.9.4';
    const runtimeVersion = '0.2.1-alpha.8';
    const setup = `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`;
    const portable = `FreeCode-DeepSeek-Harness-${version}-win-x64-portable.exe`;
    const runtime = `deepseek-harness-runtime-${runtimeVersion}-win32-x64.tar.gz`;
    for (const name of [setup, portable, runtime]) writeFileSync(join(directory, name), 'local-fixture-' + name);
    await writeLocalCandidateBundle({ directory, version, runtimeVersion });
    const manifest = JSON.parse(readFileSync(join(directory, 'local-candidate.json'), 'utf8'));
    assert.equal(manifest.runtime.version, runtimeVersion);
    assert.equal(manifest.artifacts.length, 3);
    const script = readFileSync(join(directory, 'Prepare-Local-Runtime.ps1'), 'utf8');
    assert.doesNotMatch(script, /Stop-Process|Get-Process|taskkill|Win32_Process|Start-Process.*setup/i);
    if (process.platform !== 'win32') return;
    const run = args => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(directory, 'Prepare-Local-Runtime.ps1'), ...args], {
      encoding: 'utf8', windowsHide: true, timeout: 30_000,
    });
    const check = run([]);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /CHECK ONLY/);
    const noConsent = run(['-PrepareRuntime']);
    assert.notEqual(noConsent.status, 0);
    assert.match(noConsent.stderr, /FreeCodeIsClosed/);
    writeFileSync(join(directory, setup), 'wrong setup');
    const corrupt = run([]);
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /SHA-256|size/i);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('candidate bundle paths cannot escape their chosen output directory', async () => {
  await assert.rejects(writeLocalCandidateBundle({ directory: tmpdir(), version: '../escape', runtimeVersion: '0.2.1-alpha.8' }), /version/i);
});

test('explicit preparation promotes only the exact runtime and retains the previous cache in isolated APPDATA', { skip: process.platform !== 'win32' }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'freecode-preload-isolated-'));
  try {
  const version = '0.9.4', runtimeVersion = '0.2.1-alpha.8';
    const stage = join(directory, 'stage');
    const appData = join(directory, 'isolated-appdata');
    const cache = join(appData, '@freecode/shell/harness-runtime');
    const put = (file, text) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, text); };
    put(join(cache, 'dsh/old-cache.txt'), 'preserve previous cache');
    put(join(cache, 'runtime-manifest.json'), '{"version":"previous"}');
    for (const part of ['package.json', 'apps/cli/lib/bin.js', 'packages/fixture/file.js', 'node_modules/fixture/file.js']) put(join(stage, 'dsh', part), '{}');
    put(join(stage, 'runtime-manifest.json'), JSON.stringify({ version: runtimeVersion, nodeModuleVersion: '149', cli: 'dsh/apps/cli/lib/bin.js' }));
    for (const type of ['setup', 'portable']) writeFileSync(join(directory, `FreeCode-DeepSeek-Harness-${version}-win-x64-${type}.exe`), 'MZ fixture');
    const archive = join(directory, `deepseek-harness-runtime-${runtimeVersion}-win32-x64.tar.gz`);
    const packed = spawnSync(join(process.env.SystemRoot, 'System32/tar.exe'), ['-czf', archive, '-C', stage, 'dsh', 'runtime-manifest.json'], { windowsHide: true, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    await writeLocalCandidateBundle({ directory, version, runtimeVersion });
    const prepared = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', join(directory, 'Prepare-Local-Runtime.ps1'), '-PrepareRuntime', '-FreeCodeIsClosed'], {
      env: { ...process.env, APPDATA: appData }, windowsHide: true, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.equal(JSON.parse(readFileSync(join(cache, 'runtime-manifest.json'), 'utf8')).version, runtimeVersion);
    assert.ok(existsSync(join(cache, 'dsh/apps/cli/lib/bin.js')));
    const backup = readdirSync(cache).find(name => name.startsWith('.dsh-backup-'));
    assert.equal(readFileSync(join(cache, backup, 'old-cache.txt'), 'utf8'), 'preserve previous cache');
    assert.ok(readdirSync(cache).some(name => name.startsWith('.runtime-manifest-backup-')));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
