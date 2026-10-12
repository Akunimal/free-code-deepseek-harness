import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const verifier = join(root, 'scripts', 'verify-native-abi.mjs');
const electronBinary = join(root, 'apps', 'shell', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const tempDirs: string[] = [];

const abiProbe = spawnSync(electronBinary, ['-e', 'process.stdout.write(process.versions.modules)'], {
  encoding: 'utf8',
  windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
if (abiProbe.status !== 0) throw new Error(`Could not read packaged Electron ABI: ${abiProbe.stderr}`);
const electronAbi = abiProbe.stdout.trim();

function createRuntime(addonPath: string): string {
  const fixture = mkdtempSync(join(tmpdir(), 'freecode-native-abi-'));
  tempDirs.push(fixture);
  const runtime = join(fixture, 'dsh');
  const nativeAddon = join(runtime, 'node_modules', addonPath);
  mkdirSync(dirname(nativeAddon), { recursive: true });
  writeFileSync(nativeAddon, 'not a native addon');
  writeFileSync(join(fixture, 'runtime-manifest.json'), JSON.stringify({
    nodeModuleVersion: electronAbi,
  }));
  return runtime;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function verify(runtime: string) {
  return spawnSync(process.execPath, [verifier, runtime], {
    encoding: 'utf8',
    windowsHide: true,
    env: process.env,
  });
}

describe('native ABI verifier', () => {
  it('skips and reports native addons built for a foreign platform/architecture', () => {
    const runtime = createRuntime('fixture-addon-darwin-arm64/build/Release/fixture.node');

    const result = verify(runtime);

    expect(result.stderr + result.stdout).toMatch(/SKIP foreign native addon .*darwin-arm64/i);
    expect(result.stderr + result.stdout).not.toMatch(/WARNING load failed/i);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/no host-compatible \.node addons/i);
  });

  it('fails packaging when a host-applicable native addon cannot be loaded', () => {
    const runtime = createRuntime('fixture-addon/build/Release/fixture.node');

    const result = verify(runtime);

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/FAIL.*host.*native addon/i);
  });

  it('skips a Windows GNU prebuild when packaged Electron requires the MSVC target', () => {
    const runtime = createRuntime('fixture-addon-win32-x64-gnu/build/Release/fixture.node');

    const result = verify(runtime);

    expect(result.stderr + result.stdout).toMatch(/SKIP foreign native addon .*win32-x64-gnu/i);
    expect(result.stderr + result.stdout).not.toMatch(/WARNING load failed/i);
  });
});
