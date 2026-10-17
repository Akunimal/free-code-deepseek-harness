#!/usr/bin/env node
/**
 * Interactive NSIS smoke for a disposable Windows VM only — installs the
 * exact versioned setup into a temporary directory, launches the app to
 * exercise first-run DSH bootstrap, then uninstalls.
 *
 * This is the last-line defense against the v0.2.4 install crash: even if
 * the vendor bundle is fresh (gated by verify-vendor-bundles-fresh.mjs)
 * and the installer.nsh is clean (gated by verify-nsis-hooks.mjs), NSIS
 * template changes upstream could reintroduce a post-extraction wipe.
 * This gate runs the actual installer against the actual filesystem.
 *
 * Refuses to run on an ordinary workstation because NSIS changes user-scoped
 * shortcuts/registration and launches the GUI. Requires both explicit VM
 * opt-in variables and the exact package-version setup path.
 *
 * Exit codes:
 *   0 — install layout is complete.
 *   1 — one or more critical paths are missing after install.
 *   2 — setup.exe not found, or install itself failed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { removeTestInstall } from './remove-test-install.mjs';
import { stopInstalledProcesses, stopInstalledProcessesReferencing, verifyInstalledRuntime } from './verify-installed-runtime.mjs';
import { cleanupInstalledShortcuts, verifyInstalledShortcuts } from './verify-nsis-shortcuts.mjs';
import { interactiveNsisSmokeOptedIn } from './nsis-smoke-guard.mjs';
import { resolveNsisSetup } from './nsis-smoke-setup.mjs';
import { verifyTorRuntimeAssets } from './tor-runtime-assets.mjs';

if (process.platform !== 'win32') {
  console.log('verify-nsis-install-layout: skipped (non-Windows host).');
  process.exit(0);
}

if (!interactiveNsisSmokeOptedIn(process.env)) {
  console.error('verify-nsis-install-layout: refused; run only in a disposable Windows VM with FREECODE_ALLOW_INTERACTIVE_NSIS_SMOKE=1 and FREECODE_NSIS_SMOKE_ENV=disposable-vm.');
  process.exit(2);
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_DIR = resolve(REPO_ROOT, 'apps/shell/release');
const INSTALL_TIMEOUT_MS = Number(process.env.FREECODE_NSIS_SMOKE_TIMEOUT_MS ?? 1_800_000);
if (!Number.isFinite(INSTALL_TIMEOUT_MS) || INSTALL_TIMEOUT_MS <= 0) {
  throw new Error('verify-nsis-install-layout: FREECODE_NSIS_SMOKE_TIMEOUT_MS must be a positive number');
}
if (!process.env.FREECODE_NSIS_SETUP_PATH && !existsSync(RELEASE_DIR)) {
  console.error(`verify-nsis-install-layout: release dir missing: ${RELEASE_DIR}`);
  process.exit(2);
}

const packageVersion = JSON.parse(readFileSync(join(REPO_ROOT, 'apps/shell/package.json'), 'utf8')).version;
let setup;
try {
  setup = resolveNsisSetup({
    releaseDir: RELEASE_DIR,
    version: packageVersion,
    setupPath: process.env.FREECODE_NSIS_SETUP_PATH,
  });
} catch (error) {
  console.error(`verify-nsis-install-layout: ${error.message}`);
  process.exit(2);
}
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
    // The packaged installer rejects persisted `freecode-nsis-smoke-*`
    // InstallLocation values unless this exact child target is authorized.
    // Keep the exception scoped to this installer process only.
    env: { ...process.env, FREECODE_NSIS_SMOKE_INSTALL_DIR: installDir },
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
    const REQUIRED_FILES = [
      'resources/freecode/runtime-manifest.json',
       'resources/freecode/tor/tor.exe',
       'resources/freecode/tor/geoip',
       'resources/freecode/tor/geoip6',
    ];
    const FORBIDDEN_PATHS = [
      'resources/freecode/dsh',
    ];
    const missing = REQUIRED_FILES.filter((rel) => !existsSync(join(installDir, rel)));
    const unexpectedlyBundled = FORBIDDEN_PATHS.filter((rel) => existsSync(join(installDir, rel)));
    let invalidManifest = false;
    if (!missing.includes('resources/freecode/runtime-manifest.json')) {
      try {
        const manifest = JSON.parse(readFileSync(join(installDir, 'resources/freecode/runtime-manifest.json'), 'utf8'));
        invalidManifest = typeof manifest.version !== 'string' || typeof manifest.nodeModuleVersion !== 'string' ||
          !/^\d+$/.test(manifest.nodeModuleVersion);
      } catch {
        invalidManifest = true;
      }
    }
     let torAssetFailure = null;
     if (missing.length === 0) {
       try {
         const runtimeDeps = JSON.parse(readFileSync(join(REPO_ROOT, 'apps/shell/resources/runtime-deps.json'), 'utf8'));
         const tor = runtimeDeps.dependencies.find((dependency) => dependency.id === 'tor' && dependency.required === true);
         if (!tor || typeof tor.sha256 !== 'string') throw new Error('Tor asset is not pinned in runtime-deps.json');
         verifyTorRuntimeAssets(join(installDir, 'resources/freecode'), tor.sha256);
       } catch (error) {
         torAssetFailure = error.message;
       }
     }
     if (missing.length > 0 || unexpectedlyBundled.length > 0 || invalidManifest || torAssetFailure) {
      console.error('verify-nsis-install-layout: MISSING after install:');
      for (const m of missing) console.error(`  - ${m}`);
      for (const m of unexpectedlyBundled) console.error(`  - unexpectedly bundled: ${m}`);
      if (invalidManifest) console.error('  - runtime compatibility manifest is malformed');
       if (torAssetFailure) console.error(`  - ${torAssetFailure}`);
      exitCode = 1;
    } else {
      console.log('verify-nsis-install-layout: static resources and DSH compatibility manifest are present; the DSH payload is excluded.');
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
