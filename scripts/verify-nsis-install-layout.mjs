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
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

if (process.platform !== 'win32') {
  console.log('verify-nsis-install-layout: skipped (non-Windows host).');
  process.exit(0);
}

const RELEASE_DIR = resolve(process.cwd(), 'apps/shell/release');
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
try {
  // NSIS one-click silent install with explicit target directory.
  // /S = silent, /D=<path> = install dir (must be last arg, no quotes).
  const install = spawnSync(setup, ['/S', `/D=${installDir}`], {
    windowsHide: true,
    timeout: 300_000,
  });
  if (install.status !== 0) {
    console.error(`verify-nsis-install-layout: installer exited ${install.status}`);
    exitCode = 2;
  } else {
    const CRITICAL = [
      'resources/freecode/dsh/apps/cli/lib/bin.js',
      'resources/freecode/dsh/packages',
      'resources/freecode/dsh/node_modules',
      'resources/freecode/dsh/node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/index.js',
      'resources/freecode/runtime-manifest.json',
      'resources/freecode/opencode2api/opencode2api-win-x64.exe',
    ];
    const missing = CRITICAL.filter((rel) => !existsSync(join(installDir, rel)));
    if (missing.length > 0) {
      console.error('verify-nsis-install-layout: MISSING after install:');
      for (const m of missing) console.error(`  - ${m}`);
      exitCode = 1;
    } else {
      console.log(`verify-nsis-install-layout: ${CRITICAL.length} critical paths present.`);
    }
  }

  // Silent uninstall (best effort — do not fail the gate if uninstaller misbehaves).
  const uninstallers = readdirSync(installDir).filter((name) => /^Uninstall/i.test(name));
  if (uninstallers.length > 0) {
    spawnSync(join(installDir, uninstallers[0]), ['/S'], { windowsHide: true, timeout: 60_000 });
  }
} finally {
  try { rmSync(installDir, { recursive: true, force: true }); } catch { /* best effort */ }
}

process.exit(exitCode);
