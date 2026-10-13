import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Electron's first cold start can contend with the rest of the full Vitest
// suite; keep the assertion bounded without mistaking worker contention for
// the silent-exit regression this test is meant to catch.
const ELECTRON_TEST_TIMEOUT_MS = 90_000;
const VITEST_TEST_TIMEOUT_MS = ELECTRON_TEST_TIMEOUT_MS + 10_000;

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const vendorRoot = join(import.meta.dirname, '../../../vendor/deepseek-harness');
const cliEntry = join(vendorRoot, 'apps/cli/lib/bin.js');
const dshRuntimeRoot = join(import.meta.dirname, '../resources/freecode/dsh');
const dshNativeInternalModules = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../scripts/dsh-native-internal-modules.json'), 'utf8'),
) as string[];
const cliVersion = JSON.parse(
  readFileSync(join(vendorRoot, 'apps/cli/package.json'), 'utf8'),
).version as string;

describe('packaged Electron Node runtime', () => {
  it('executes the shipped DSH CLI entry point instead of silently exiting', () => {
    const result = spawnSync(electronPath, [cliEntry, '--version'], {
      cwd: vendorRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      timeout: ELECTRON_TEST_TIMEOUT_MS,
      windowsHide: true,
    });

    expect(result.error, `Electron failed to run the CLI: ${result.error?.message ?? ''}`).toBeUndefined();
    expect(result.status, `CLI exited with stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout.trim()).toBe(cliVersion);
  }, VITEST_TEST_TIMEOUT_MS);

  it('loads the native DSH internal-module addon in the packaged Electron runtime', () => {
    const probe = [
      'const addon = require("node-addon-require-builtin");',
      `const moduleIds = ${JSON.stringify(dshNativeInternalModules)};`,
      'for (const moduleId of moduleIds) addon.requireBuiltin(moduleId);',
      'console.log(JSON.stringify({ electronVersion: process.versions.electron, nodeVersion: process.version, nodeModuleVersion: process.versions.modules }));',
    ].join('\n');
    const result = spawnSync(electronPath, ['-e', probe], {
      cwd: dshRuntimeRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      timeout: ELECTRON_TEST_TIMEOUT_MS,
      windowsHide: true,
    });

    expect(result.error, `Electron failed to probe DSH native internals: ${result.error?.message ?? ''}`).toBeUndefined();
    expect(result.status, `Electron cannot load the DSH native internal loader: ${result.stderr}`).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      electronVersion: '44.0.0',
      nodeVersion: 'v24.18.1',
      nodeModuleVersion: '149',
    });
  }, VITEST_TEST_TIMEOUT_MS);
});
