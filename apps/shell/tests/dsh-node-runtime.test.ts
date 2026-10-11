import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Electron's first cold start can contend with the rest of the full Vitest
// suite; keep the assertion bounded without mistaking worker contention for
// the silent-exit regression this test is meant to catch.
const ELECTRON_TEST_TIMEOUT_MS = 60_000;

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const vendorRoot = join(import.meta.dirname, '../../../vendor/deepseek-harness');
const cliEntry = join(vendorRoot, 'apps/cli/lib/bin.js');
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
  });
});
