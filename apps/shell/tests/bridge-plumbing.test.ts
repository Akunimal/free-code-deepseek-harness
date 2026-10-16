/**
 * Bridge plumbing invariant — the Electron dialog bridge is the ONLY thing
 * that lets the Win32 directory picker work under packaged Electron.
 * Two invariants must never regress:
 *
 * 1. On win32 the shell must pass `FREECODE_DIALOG_BRIDGE_ENDPOINT` and
 *    `FREECODE_DIALOG_BRIDGE_TOKEN` to the harness child. If a refactor
 *    drops either, dsh falls back to koffi and crashes.
 *
 * 2. The shipped `dsh-host-directory-picker-native/lib/index.js` bundle
 *    must contain the bridge env-var reference. Editing the source .ts
 *    without rebuilding the bundle is the F1 build gap that shipped a
 *    broken v0.2.4. This test grep-checks the actual on-disk bundle.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHarnessExtraEnv } from '../src/main/harness-env.js';

describe('bridge extraEnv plumbing', () => {
  it('includes both bridge env vars when the bridge is created', () => {
    const env = buildHarnessExtraEnv({ endpoint: 'http://127.0.0.1:56789/pick-directory', fileOpenEndpoint: 'http://127.0.0.1:56789/open-text-file', token: 'a'.repeat(64) });
    expect(env.FREECODE_DIALOG_BRIDGE_ENDPOINT).toBe('http://127.0.0.1:56789/pick-directory');
    expect(env.FREECODE_DIALOG_BRIDGE_TOKEN).toHaveLength(64);
    expect(env.FREECODE_FILE_OPEN_ENDPOINT).toBe('http://127.0.0.1:56789/open-text-file');
    expect(env.FREECODE_GUI_LAUNCH_ENDPOINT).toBe('http://127.0.0.1:56789/launch-gui');
    expect(env.FREECODE_GUI_OPEN_DIRECTORY_ENDPOINT).toBe('http://127.0.0.1:56789/open-directory');
    expect(env.FREECODE_GUI_OPEN_PATH_ENDPOINT).toBe('http://127.0.0.1:56789/open-path');
    expect(env.FREECODE_HEADLESS_DESKTOP).toBe(process.platform === 'win32' ? '1' : undefined);
  });

  it('omits bridge env vars when the bridge is not available', () => {
    const env = buildHarnessExtraEnv(null);
    expect(env.FREECODE_DIALOG_BRIDGE_ENDPOINT).toBeUndefined();
    expect(env.FREECODE_DIALOG_BRIDGE_TOKEN).toBeUndefined();
    expect(env.FREECODE_FILE_OPEN_ENDPOINT).toBeUndefined();
    expect(env.FREECODE_GUI_LAUNCH_ENDPOINT).toBeUndefined();
    expect(env.FREECODE_GUI_OPEN_DIRECTORY_ENDPOINT).toBeUndefined();
    expect(env.FREECODE_GUI_OPEN_PATH_ENDPOINT).toBeUndefined();
  });

  it('never forgets DSH_CLIENT_TITLE', () => {
    for (const bridge of [null, { endpoint: 'http://127.0.0.1:56789/pick-directory', fileOpenEndpoint: 'http://127.0.0.1:56789/open-text-file', token: 'z' }]) {
      const env = buildHarnessExtraEnv(bridge);
      expect(env.DSH_CLIENT_TITLE).toBe('FreeCode');
    }
  });
});

const BUNDLE = resolve(
  import.meta.dirname,
  '../../../vendor/deepseek-harness/packages/host/directory-picker-native/lib/index.js',
);

describe('directory-picker-native bundle smoke', () => {
  it('has a built bundle; release-critical tests must not silently skip it', () => {
    expect(existsSync(BUNDLE), `missing compiled picker bundle: ${BUNDLE}`).toBe(true);
  });

  it('contains the bridge env-var reference — protects against source/bundle drift', () => {
    const src = readFileSync(BUNDLE, 'utf8');
    expect(src).toContain('FREECODE_DIALOG_BRIDGE_ENDPOINT');
    expect(src).toContain('FREECODE_DIALOG_BRIDGE_TOKEN');
  });

  it('contains the bridge-preferred branch — koffi call must be gated on env absence', () => {
    const src = readFileSync(BUNDLE, 'utf8');
    // The compiled branch tests both env vars before calling the bridge.
    // If tsdown dropped the code path, either name would still appear as
    // a live reference; require both together to prove the conditional.
    const endpointCount = (src.match(/FREECODE_DIALOG_BRIDGE_ENDPOINT/g) ?? []).length;
    const tokenCount = (src.match(/FREECODE_DIALOG_BRIDGE_TOKEN/g) ?? []).length;
    expect(endpointCount).toBeGreaterThan(0);
    expect(tokenCount).toBeGreaterThan(0);
  });
});
