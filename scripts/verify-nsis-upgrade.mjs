#!/usr/bin/env node
/**
 * Zero-trust upgrade smoke: install the known-good 0.2.4 setup, place a
 * stale payload marker and a user-data marker, then update that same install
 * with the newest 0.2.8 setup. The stale marker must disappear while the
 * user-data marker must survive.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.log('verify-nsis-upgrade: skipped (non-Windows host).');
  process.exit(0);
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_DIR = resolve(REPO_ROOT, 'apps/shell/release');
const NEW_SETUP = join(RELEASE_DIR, 'FreeCode-DeepSeek-Harness-0.2.8-win-x64-setup.exe');
const OLD_NAME = 'FreeCode-DeepSeek-Harness-0.2.4-win-x64-setup.exe';
const oldCandidates = [
  join(RELEASE_DIR, OLD_NAME),
  ...[' _backup-v0.2.4-final', ' _backup-0.2.4-r2', ' _backup-0.2.4-pre-fix']
    .map((name) => join(RELEASE_DIR, name.trim(), OLD_NAME)),
];
const OLD_SETUP = oldCandidates.find((candidate) => existsSync(candidate));

if (!OLD_SETUP || !existsSync(NEW_SETUP)) {
  console.error('verify-nsis-upgrade: both 0.2.4 and 0.2.8 setup files are required.');
  process.exit(2);
}

const installDir = mkdtempSync(join(tmpdir(), 'freecode-nsis-upgrade-'));
const layoutIsPopulated = () => {
  const required = [
    join(dsh(), 'apps/cli/lib/bin.js'),
    join(installDir, 'resources/freecode/runtime-manifest.json'),
    join(installDir, 'resources/freecode/opencode2api/opencode2api-win-x64.exe'),
  ];
  const dirs = [join(dsh(), 'packages'), join(dsh(), 'node_modules')];
  return required.every((target) => existsSync(target))
    && dirs.every((target) => existsSync(target) && readdirSync(target).length > 0);
};

const stopProcessTree = (pid) => {
  if (!pid) return;
  spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
};

const runSetup = async (setup, label, isComplete = layoutIsPopulated) => {
  console.log(`verify-nsis-upgrade: installing ${label} from ${setup}`);
  const child = spawn(setup, ['/S', `/D=${installDir}`], {
    windowsHide: true,
    stdio: 'ignore',
  });
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`${label} installer error: ${spawnError.message}`);
    if (child.exitCode !== null) {
      if (child.exitCode !== 0) throw new Error(`${label} installer exited ${child.exitCode}`);
      assertPopulated(label);
      return;
    }
    // One-click installers may keep the parent alive while RUN_AFTER_FINISH
    // launches the app. Once extraction is complete, the layout is the
    // contract we care about; stop only this installer process tree.
    if (isComplete()) {
      console.log(`verify-nsis-upgrade: ${label} payload extraction complete; closing installer process tree.`);
      stopProcessTree(child.pid);
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  stopProcessTree(child.pid);
  throw new Error(`${label} installer timed out after 900 seconds`);
};

const dsh = () => join(installDir, 'resources/freecode/dsh');
const assertPopulated = (label) => {
  const required = [
    join(dsh(), 'apps/cli/lib/bin.js'),
    join(installDir, 'resources/freecode/runtime-manifest.json'),
    join(installDir, 'resources/freecode/opencode2api/opencode2api-win-x64.exe'),
  ];
  const empty = [join(dsh(), 'packages'), join(dsh(), 'node_modules')]
    .filter((target) => !existsSync(target) || readdirSync(target).length === 0);
  const missing = required.filter((target) => !existsSync(target));
  if (missing.length || empty.length) {
    throw new Error(`${label} layout incomplete; missing=${missing.join(',')} empty=${empty.join(',')}`);
  }
};

try {
  await runSetup(OLD_SETUP, '0.2.4');
  assertPopulated('0.2.4');

  const staleMarker = join(dsh(), 'packages', '.stale-0.2.4-payload-marker');
  const userDataMarker = join(installDir, 'user-data', 'must-survive-upgrade.txt');
  writeFileSync(staleMarker, 'old payload\n');
  mkdirSync(join(installDir, 'user-data'), { recursive: true });
  writeFileSync(userDataMarker, 'user data\n', 'utf8');

  await runSetup(NEW_SETUP, '0.2.8', () => layoutIsPopulated() && !existsSync(staleMarker));
  assertPopulated('0.2.8');

  if (existsSync(staleMarker)) throw new Error('stale 0.2.4 payload marker survived upgrade');
  if (!existsSync(userDataMarker)) throw new Error('user-data marker was deleted by upgrade');
  console.log('verify-nsis-upgrade: 0.2.4 -> 0.2.8 passed; payload replaced and user data preserved.');
} catch (error) {
  console.error(`verify-nsis-upgrade: ${error.message}`);
  process.exitCode = 1;
} finally {
  const uninstallers = readdirSync(installDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^Uninstall/i.test(entry.name));
  if (uninstallers.length) {
    spawnSync(join(installDir, uninstallers[0].name), ['/S'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 120_000,
    });
  }
  try { rmSync(installDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
