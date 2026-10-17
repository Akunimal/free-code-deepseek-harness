#!/usr/bin/env node
/**
 * Zero-trust upgrade smoke: install the last-known-good 0.4.3 setup, place a
 * stale payload marker and a user-data marker, then update that same install
 * with the current candidate setup. The stale marker must disappear while the
 * user-data marker must survive.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { removeTestInstall } from './remove-test-install.mjs';
import { stopInstalledProcesses, stopInstalledProcessesReferencing, verifyInstalledRuntime } from './verify-installed-runtime.mjs';
import { cleanupInstalledShortcuts, verifyInstalledShortcuts } from './verify-nsis-shortcuts.mjs';

if (process.platform !== 'win32') {
  console.log('verify-nsis-upgrade: skipped (non-Windows host).');
  process.exit(0);
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_DIR = resolve(REPO_ROOT, 'apps/shell/release');
const INSTALL_TIMEOUT_MS = Number(process.env.FREECODE_NSIS_SMOKE_TIMEOUT_MS ?? 1_800_000);
if (!Number.isFinite(INSTALL_TIMEOUT_MS) || INSTALL_TIMEOUT_MS <= 0) {
  throw new Error('verify-nsis-upgrade: FREECODE_NSIS_SMOKE_TIMEOUT_MS must be a positive number');
}
const rootPackage = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const NEW_VERSION = rootPackage.version;
const NEW_SETUP = join(RELEASE_DIR, `FreeCode-DeepSeek-Harness-${NEW_VERSION}-win-x64-setup.exe`);
const STABLE_VERSION = '0.4.3';
const OLD_NAME = `FreeCode-DeepSeek-Harness-${STABLE_VERSION}-win-x64-setup.exe`;
const oldCandidates = [
  join(RELEASE_DIR, OLD_NAME),
  ...[` _backup-v${STABLE_VERSION}`, ` _backup-${STABLE_VERSION}`]
    .map((name) => join(RELEASE_DIR, name.trim(), OLD_NAME)),
];
const OLD_SETUP = oldCandidates.find((candidate) => existsSync(candidate));

if (!OLD_SETUP || !existsSync(NEW_SETUP)) {
  console.error(`verify-nsis-upgrade: ${STABLE_VERSION} and ${NEW_VERSION} setup files are required.`);
  process.exit(2);
}

const installDir = mkdtempSync(join(tmpdir(), 'freecode-nsis-upgrade-'));
const legacyLayoutIsPopulated = () => {
  const required = [
    join(dsh(), 'apps/cli/lib/bin.js'),
    join(installDir, 'resources/freecode/runtime-manifest.json'),
  ];
  const dirs = [join(dsh(), 'packages'), join(dsh(), 'node_modules')];
  return required.every((target) => existsSync(target))
    && dirs.every((target) => existsSync(target) && readdirSync(target).length > 0);
};
const layoutIsPopulated = () => !existsSync(dsh())
  && existsSync(join(installDir, 'resources/freecode/runtime-manifest.json'));

const stopProcessTree = (pid) => {
  if (!pid) return;
  spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
};

const runUninstaller = (uninstallPath) => {
  const direct = spawnSync(uninstallPath, ['/S'], {
    windowsHide: true,
    stdio: 'ignore',
    timeout: 120_000,
  });
  if (!direct.error && direct.status === 0) return direct;

  // Some legacy NSIS uninstallers reject Node's direct Windows spawn with
  // EFTYPE even though cmd.exe can execute the same PE successfully. Keep
  // this as a narrow compatibility fallback, and preserve the failure if
  // the shell cannot execute it either.
  if (direct.error?.code !== 'EFTYPE') return direct;
  const command = `"${uninstallPath.replaceAll('"', '\\"')}" /S`;
  return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command], {
    windowsHide: true,
    stdio: 'ignore',
    timeout: 120_000,
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
  // The historical stable payload is materially larger than the current
  // candidate and can take over 15 minutes to expand on a cold Windows
  // profile or slower temp volume. Match the clean-install smoke budget so
  // the upgrade gate does not misclassify healthy extraction as a timeout.
  const deadline = Date.now() + INSTALL_TIMEOUT_MS;
  let completeSince = null;
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`${label} installer error: ${spawnError.message}`);
    if (child.exitCode !== null) {
      if (child.exitCode !== 0) throw new Error(`${label} installer exited ${child.exitCode}`);
      assertPopulated(label);
      return;
    }
    // One-click installers may keep the parent alive while RUN_AFTER_FINISH
    // launches the app. Once extraction is complete, give customInstall a
    // short grace period to recreate shortcuts before stopping only this
    // installer process tree.
    if (isComplete()) {
      completeSince ??= Date.now();
      if (Date.now() - completeSince >= 15_000) {
        console.log(`verify-nsis-upgrade: ${label} payload extraction complete; closing installer process tree.`);
        stopProcessTree(child.pid);
        try { stopInstalledProcesses(installDir); } catch { /* the next phase will report a live process */ }
        return;
      }
    } else {
      completeSince = null;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  stopProcessTree(child.pid);
  throw new Error(`${label} installer timed out after ${Math.round(INSTALL_TIMEOUT_MS / 1000)} seconds`);
};

const dsh = () => join(installDir, 'resources/freecode/dsh');
const assertPopulated = (label) => {
  const forbidden = [dsh()]
    .filter((target) => existsSync(target));
  const manifest = join(installDir, 'resources/freecode/runtime-manifest.json');
  if (!existsSync(manifest) || forbidden.length) {
    throw new Error(`${label} layout invalid; missing=${existsSync(manifest) ? '' : manifest} unexpectedlyBundled=${forbidden.join(',')}`);
  }
};
const assertLegacyPopulated = (label) => {
  const required = [
    join(dsh(), 'apps/cli/lib/bin.js'),
    join(installDir, 'resources/freecode/runtime-manifest.json'),
  ];
  const empty = [join(dsh(), 'packages'), join(dsh(), 'node_modules')]
    .filter((target) => !existsSync(target) || readdirSync(target).length === 0);
  const missing = required.filter((target) => !existsSync(target));
  if (missing.length || empty.length) {
    throw new Error(`${label} legacy layout incomplete; missing=${missing.join(',')} empty=${empty.join(',')}`);
  }
};

try {
  await runSetup(OLD_SETUP, STABLE_VERSION, legacyLayoutIsPopulated);
  assertLegacyPopulated(STABLE_VERSION);

  const staleMarker = join(dsh(), 'packages', `.stale-${STABLE_VERSION}-payload-marker`);
  const userDataDir = join(installDir, '.release-smoke-user-data');
  const userDataMarker = join(userDataDir, 'must-survive-upgrade.txt');
  writeFileSync(staleMarker, 'old payload\n');
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(userDataMarker, 'user data\n', 'utf8');

  await runSetup(NEW_SETUP, NEW_VERSION, () => {
    return layoutIsPopulated() && !existsSync(staleMarker);
  });
  assertPopulated(NEW_VERSION);

  await verifyInstalledRuntime({ installDir, label: `${NEW_VERSION} upgrade` });
  verifyInstalledShortcuts({ installDir, label: `${NEW_VERSION} upgrade shortcuts` });

  if (existsSync(staleMarker)) throw new Error(`stale ${STABLE_VERSION} payload marker survived upgrade`);
  if (!existsSync(userDataMarker)) throw new Error('user-data marker was deleted by upgrade');
  console.log(`verify-nsis-upgrade: ${STABLE_VERSION} -> ${NEW_VERSION} passed; payload replaced, runtime booted, and user data preserved.`);
} catch (error) {
  console.error(`verify-nsis-upgrade: ${error.message}`);
  process.exitCode = 1;
} finally {
  const uninstallers = readdirSync(installDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^Uninstall/i.test(entry.name));
  if (uninstallers.length) {
    const uninstall = runUninstaller(join(installDir, uninstallers[0].name));
    if (uninstall.error || uninstall.status !== 0) {
      console.error(`verify-nsis-upgrade: uninstaller failed with ${uninstall.error?.message ?? uninstall.status}`);
      process.exitCode = 1;
    }
  }
  try { cleanupInstalledShortcuts({ installDir }); } catch (error) {
    console.error(`verify-nsis-upgrade: failed to remove temporary shortcuts: ${error.message}`);
    process.exitCode = 1;
  }
  try {
    await removeTestInstall(installDir, {
      label: 'verify-nsis-upgrade test install',
      beforeAttempt: () => {
        try { stopInstalledProcesses(installDir); } catch { /* cleanup retries still apply */ }
        try { stopInstalledProcessesReferencing(installDir); } catch { /* cleanup retries still apply */ }
      },
    });
  } catch (error) {
    console.error(`verify-nsis-upgrade: failed to remove test install: ${error.message}`);
    process.exitCode = 1;
  }
}
