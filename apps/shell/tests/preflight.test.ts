/**
 * Startup preflight tests — validate that the layout checker refuses to boot
 * the supervisor when the installer bug of v0.2.4 or the bundle staleness bug
 * of v0.2.4-r1 recur. Uses tmp fs, no Electron.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyHarnessLayout, formatPreflightFailure } from '../src/main/preflight.js';

let root: string;

function makeFullLayout(base: string, opts: { bundleHasBridge?: boolean } = {}): void {
  const hasBridge = opts.bundleHasBridge ?? true;
  const dsh = join(base, 'dsh');
  mkdirSync(join(dsh, 'apps', 'cli', 'lib'), { recursive: true });
  writeFileSync(join(dsh, 'apps', 'cli', 'lib', 'bin.js'), '// entry\n');
  mkdirSync(join(dsh, 'packages'), { recursive: true });
  writeFileSync(join(dsh, 'packages', '.keep'), '');
  const bundleDir = join(dsh, 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib');
  mkdirSync(bundleDir, { recursive: true });
  const bundle = hasBridge
    ? '// bundle\nconst env = process.env.FREECODE_DIALOG_BRIDGE_ENDPOINT;\n'
    : '// bundle without bridge\n';
  writeFileSync(join(bundleDir, 'index.js'), bundle);
  writeFileSync(join(base, 'runtime-manifest.json'), '{"version":"0.0.0","cli":"dsh/apps/cli/lib/bin.js"}');
  mkdirSync(join(base, 'opencode2api'), { recursive: true });
  writeFileSync(join(base, 'opencode2api', 'opencode2api-win-x64.exe'), '');
  writeFileSync(join(base, 'opencode2api', 'opencode2api-linux-x64'), '');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'freecode-preflight-'));
});

afterEach(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('verifyHarnessLayout', () => {
  it('passes on a complete layout', () => {
    makeFullLayout(root);
    const result = verifyHarnessLayout({ resourcesDir: root, platform: 'win32' });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('reports missing bin.js — the v0.2.4 NSIS customInstall bug', () => {
    makeFullLayout(root);
    rmSync(join(root, 'dsh', 'apps'), { recursive: true, force: true });
    const result = verifyHarnessLayout({ resourcesDir: root, platform: 'win32' });
    expect(result.ok).toBe(false);
    expect(result.missing.some(m => m.includes('apps/cli/lib/bin.js'))).toBe(true);
  });

  it('reports empty packages/ directory as missing', () => {
    makeFullLayout(root);
    rmSync(join(root, 'dsh', 'packages'), { recursive: true, force: true });
    mkdirSync(join(root, 'dsh', 'packages'));
    const result = verifyHarnessLayout({ resourcesDir: root, platform: 'win32' });
    expect(result.ok).toBe(false);
    expect(result.missing.some(m => m.includes('packages'))).toBe(true);
  });

  it('warns when bundle lacks bridge env-var reference — the v0.2.4 build gap', () => {
    makeFullLayout(root, { bundleHasBridge: false });
    const result = verifyHarnessLayout({ resourcesDir: root, platform: 'win32' });
    expect(result.ok).toBe(false);
    expect(result.warnings.some(w => w.includes('Electron dialog bridge'))).toBe(true);
  });

  it('linux does not require the win32 opencode2api binary', () => {
    makeFullLayout(root);
    rmSync(join(root, 'opencode2api', 'opencode2api-win-x64.exe'));
    const result = verifyHarnessLayout({ resourcesDir: root, platform: 'linux' });
    expect(result.ok).toBe(true);
  });

  it('formatPreflightFailure lists every missing path and appends hint', () => {
    const failure = {
      ok: false,
      missing: ['dsh CLI entry: /x/bin.js', 'dsh packages/: /x/packages'],
      warnings: [],
    };
    const text = formatPreflightFailure(failure, 'Please reinstall.');
    expect(text).toContain('/x/bin.js');
    expect(text).toContain('/x/packages');
    expect(text).toContain('Please reinstall.');
  });
});
