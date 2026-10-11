#!/usr/bin/env node
/**
 * Post-build NSIS smoke — installs the freshly built setup.exe silently
 * into a temporary directory, verifies only static resources are bundled,
 * launches the app to exercise first-run DSH download into user data, then uninstalls.
 *
 * This is the last-line defense against the v0.2.4 install crash: even if
 * the vendor bundle is fresh (gated by verify-vendor-bundles-fresh.mjs)
 * and the installer.nsh is clean (gated by verify-nsis-hooks.mjs), NSIS
 * template changes upstream could reintroduce a post-extraction wipe.
 * This gate runs the actual installer against the actual filesystem.
 *
 * Only runs on Windows. Skips silently elsewhere. Requires a fresh setup
 * .exe in apps/shell/release/.
 *
 * Exit codes:
 *   0 — install layout is complete.
 *   1 — one or more critical paths are missing after install.
 *   2 — setup.exe not found, or install itself failed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { removeTestInstall } from './remove-test-install.mjs';
import { stopInstalledProcesses, stopInstalledProcessesReferencing, verifyInstalledRuntime } from './verify-installed-runtime.mjs';
import { cleanupInstalledShortcuts, verifyInstalledShortcuts } from './verify-nsis-shortcuts.mjs';

if (process.platform !== 'win32') {
  console.log('verify-nsis-install-layout: skipped (non-Windows host).');
  process.exit(0);
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_DIR = resolve(REPO_ROOT, 'apps/shell/release');
const INSTALL_TIMEOUT_MS = Number(process.env.FREECODE_NSIS_SMOKE_TIMEOUT_MS ?? 1_800_000);
if (!Number.isFinite(INSTALL_TIMEOUT_MS) || INSTALL_TIMEOUT_MS <= 0) {
  throw new Error('verify-nsis-install-layout: FREECODE_NSIS_SMOKE_TIMEOUT_MS must be a positive number');
}
if (!existsSync(RELEASE_DIR)) {
  console.error(`verify-nsis-install-layout: release dir missing: ${RELEASE_DIR}`);
  process.exit(2);
}

const setups = readdirSync(RELEASE_DIR).filter(
  (name) => /^FreeCode-DeepSeek-Harness-.+-win-x64-setup\.exe$/.test(name),
);
if (setups.length === 0) {
  console.error('verify-nsis-install-layout: no setup.exe in release/. Build first with `pnpm --filter @freecode/shell package`.');
  process.exit(2);
}
// Pick the newest by name (versions sort correctly for our scheme).
const setup = join(RELEASE_DIR, setups.sort().reverse()[0]);
console.log(`verify-nsis-install-layout: testing ${setup}`);

const installDir = mkdtempSync(join(tmpdir(), 'freecode-nsis-smoke-'));
console.log(`verify-nsis-install-layout: install target ${installDir}`);

let exitCode = 0;
const runUninstaller = (uninstallPath) => {
  const direct = spawnSync(uninstallPath, ['/S'], {
    windowsHide: true,
    stdio: 'ignore',
    timeout: 120_000,
  });
  if (!direct.error && direct.status === 0) return direct;
  if (direct.error?.code !== 'EFTYPE') return direct;
  const command = `"${uninstallPath.replaceAll('"', '\\"')}" /S`;
  return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command], {
    windowsHide: true,
    stdio: 'ignore',
    timeout: 120_000,
  });
};

try {
  // NSIS one-click silent install with explicit target directory.
  // /S = silent, /D=<path> = install dir (must be last arg, no quotes).
  const install = spawnSync(setup, ['/S', `/D=${installDir}`], {
    windowsHide: true,
    // Keep installer and first-run runtime download budgets separate. DSH is
    // no longer part of this setup's extraction workload.
    timeout: INSTALL_TIMEOUT_MS,
  });
  if (install.error) {
    console.error(`verify-nsis-install-layout: installer error ${install.error.message}`);
    exitCode = 2;
  } else if (install.status !== 0) {
    console.error(`verify-nsis-install-layout: installer exited ${install.status}`);
    exitCode = 2;
  } else {
    const REQUIRED_FILES = ['resources/freecode/opencode2api/opencode2api-win-x64.exe'];
    const FORBIDDEN_PATHS = [
      'resources/freecode/dsh',
      'resources/freecode/runtime-manifest.json',
    ];
    const missing = REQUIRED_FILES.filter((rel) => !existsSync(join(installDir, rel)));
    const unexpectedlyBundled = FORBIDDEN_PATHS.filter((rel) => existsSync(join(installDir, rel)));
    if (missing.length > 0 || unexpectedlyBundled.length > 0) {
      console.error('verify-nsis-install-layout: MISSING after install:');
      for (const m of missing) console.error(`  - ${m}`);
      for (const m of unexpectedlyBundled) console.error(`  - unexpectedly bundled: ${m}`);
      exitCode = 1;
    } else {
      console.log('verify-nsis-install-layout: static resources are present and the DSH payload is excluded.');
      try {
        await verifyInstalledRuntime({ installDir, label: 'fresh install' });
        console.log('verify-nsis-install-layout: installed runtime boot/headless smoke passed.');
        verifyInstalledShortcuts({ installDir, label: 'fresh install shortcuts' });
      } catch (error) {
        console.error(`verify-nsis-install-layout: installed runtime smoke failed: ${error.message}`);
        exitCode = 1;
      }
    }
  }

  // Silent uninstall is part of the gate: a release must not leave its test
  // installation behind or hide an uninstaller failure.
  const uninstallers = readdirSync(installDir).filter((name) => /^Uninstall/i.test(name));
  if (uninstallers.length > 0) {
    const uninstall = runUninstaller(join(installDir, uninstallers[0]));
    if (uninstall.error || uninstall.status !== 0) {
      console.error(`verify-nsis-install-layout: uninstaller failed with ${uninstall.error?.message ?? uninstall.status}`);
      exitCode = 1;
    }
  } else if (exitCode === 0) {
    console.error('verify-nsis-install-layout: uninstaller missing.');
    exitCode = 1;
  }
} finally {
  try { cleanupInstalledShortcuts({ installDir }); } catch (error) {
    console.error(`verify-nsis-install-layout: failed to remove temporary shortcuts: ${error.message}`);
    exitCode = 1;
  }
  try {
    await removeTestInstall(installDir, {
      label: 'verify-nsis-install-layout test install',
      beforeAttempt: () => {
        try { stopInstalledProcesses(installDir); } catch { /* cleanup retries still apply */ }
        try { stopInstalledProcessesReferencing(installDir); } catch { /* cleanup retries still apply */ }
      },
    });
  } catch (error) {
    console.error(`verify-nsis-install-layout: failed to remove test install: ${error.message}`);
    exitCode = 1;
  }
}

process.exit(exitCode);
