#!/usr/bin/env node
/**
 * Post-build NSIS smoke — installs the freshly built setup.exe silently
 * into a temporary directory, verifies the critical dsh runtime layout is
 * intact (apps/cli/lib/bin.js, packages/, node_modules/), then uninstalls.
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
import { existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyInstalledRuntime } from './verify-installed-runtime.mjs';

if (process.platform !== 'win32') {
  console.log('verify-nsis-install-layout: skipped (non-Windows host).');
  process.exit(0);
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_DIR = resolve(REPO_ROOT, 'apps/shell/release');
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
    // The 1.7 GB unpacked runtime can take several minutes on a cold Windows
    // profile or slower temp volume. A short timeout misclassifies a healthy
    // extraction as an installer failure and skips the layout assertion.
    timeout: 900_000,
  });
  if (install.error) {
    console.error(`verify-nsis-install-layout: installer error ${install.error.message}`);
    exitCode = 2;
  } else if (install.status !== 0) {
    console.error(`verify-nsis-install-layout: installer exited ${install.status}`);
    exitCode = 2;
  } else {
    const REQUIRED_FILES = [
      'resources/freecode/dsh/apps/cli/lib/bin.js',
      'resources/freecode/dsh/node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/index.js',
      'resources/freecode/runtime-manifest.json',
      'resources/freecode/opencode2api/opencode2api-win-x64.exe',
    ];
    const REQUIRED_DIRS = [
      'resources/freecode/dsh/packages',
      'resources/freecode/dsh/node_modules',
    ];
    const missing = REQUIRED_FILES.filter((rel) => !existsSync(join(installDir, rel)));
    const empty = REQUIRED_DIRS.filter((rel) => {
      const target = join(installDir, rel);
      try { return !existsSync(target) || readdirSync(target).length === 0; } catch { return true; }
    });
    if (missing.length > 0 || empty.length > 0) {
      console.error('verify-nsis-install-layout: MISSING after install:');
      for (const m of missing) console.error(`  - ${m}`);
      for (const m of empty) console.error(`  - ${m} (empty or missing)`);
      exitCode = 1;
    } else {
      console.log(`verify-nsis-install-layout: ${REQUIRED_FILES.length} files and ${REQUIRED_DIRS.length} populated directories present.`);
      try {
        await verifyInstalledRuntime({ installDir, label: 'fresh install' });
        console.log('verify-nsis-install-layout: installed runtime boot/headless smoke passed.');
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
  try { rmSync(installDir, { recursive: true, force: true }); } catch (error) {
    console.error(`verify-nsis-install-layout: failed to remove test install: ${error.message}`);
    exitCode = 1;
  }
}

process.exit(exitCode);
