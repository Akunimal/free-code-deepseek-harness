import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];

function makeValidRuntime(
  runtimeDir: string,
  nodeEngine = '^22.19.0 || >=24.0.0',
  version = '0.2.1-alpha.2',
  nodeModuleVersion = process.versions.modules,
): void {
  const dsh = join(runtimeDir, 'dsh');
  mkdirSync(join(dsh, 'apps', 'cli', 'lib'), { recursive: true });
  writeFileSync(join(dsh, 'apps', 'cli', 'lib', 'bin.js'), '// cli');
  mkdirSync(join(dsh, 'packages'), { recursive: true });
  writeFileSync(join(dsh, 'packages', 'core'), 'fixture');
  for (const [path, markers] of [['host/open-in-app', 'FREECODE_HEADLESS_DESKTOP FREECODE_GUI_LAUNCH_ENDPOINT'],
    ['util/native-command', 'FREECODE_HEADLESS_DESKTOP FREECODE_GUI_OPEN_PATH_ENDPOINT']]) {
    const dir = join(dsh, 'packages', path!, 'lib'); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'index.js'), markers!);
  }
  const bridgeDir = join(dsh, 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib');
  mkdirSync(bridgeDir, { recursive: true });
  writeFileSync(join(bridgeDir, 'index.js'), [
    'FREECODE_DIALOG_BRIDGE_ENDPOINT',
    'FREECODE_DIALOG_BRIDGE_TOKEN',
    'x-freecode-dialog-token',
    'fetch(',
  ].join('\n'));
  writeFileSync(join(dsh, 'package.json'), JSON.stringify({ engines: { node: nodeEngine } }));
  writeFileSync(join(runtimeDir, 'runtime-manifest.json'), JSON.stringify({
    version,
    nodeModuleVersion,
    cli: 'dsh/apps/cli/lib/bin.js',
  }));
}

const compatibleRequirements = {
  minimumVersion: '0.2.1-alpha.2',
  nodeModuleVersion: process.versions.modules,
};

function tempRuntimeDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'freecode-harness-bootstrap-'));
  roots.push(root);
  return join(root, 'harness-runtime');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('first-run DSH bootstrap', () => {
  it('keeps an already validated runtime offline and skips the release check', async () => {
    const resourcesDir = tempRuntimeDir();
    makeValidRuntime(resourcesDir);
    const updater = { check: vi.fn(), downloadAndInstall: vi.fn() };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({ resourcesDir, updater, platform: 'win32' })).resolves.toMatchObject({
      status: 'ready',
      version: '0.2.1-alpha.2',
      source: 'existing',
    });
    expect(updater.check).not.toHaveBeenCalled();
    expect(updater.downloadAndInstall).not.toHaveBeenCalled();
  });

  it('downloads and installs exactly once when no runtime exists', async () => {
    const resourcesDir = tempRuntimeDir();
    const info = {
      available: true,
      latestVersion: '0.2.1-alpha.2',
      assetName: 'deepseek-harness-runtime-0.2.1-alpha.2-win32-x64.tar.gz',
      assetUrl: 'https://example.test/runtime.tar.gz',
      digest: 'sha256:abc',
    };
    const updater = {
      check: vi.fn(async () => info),
      downloadAndInstall: vi.fn(async () => makeValidRuntime(resourcesDir)),
    };
    const onProgress = vi.fn();
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({ resourcesDir, updater, platform: 'win32', onProgress })).resolves.toMatchObject({
      status: 'ready',
      version: '0.2.1-alpha.2',
      source: 'downloaded',
    });
    expect(updater.check).toHaveBeenCalledTimes(1);
    expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(updater.downloadAndInstall).toHaveBeenCalledWith(info, onProgress);
  });

  it('repairs an incomplete runtime instead of starting the supervisor with it', async () => {
    const resourcesDir = tempRuntimeDir();
    mkdirSync(resourcesDir, { recursive: true });
    writeFileSync(join(resourcesDir, 'runtime-manifest.json'), '{"version":"0.2.1-alpha.2"}');
    const info = {
      available: true,
      latestVersion: '0.2.1-alpha.2',
      assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.2/runtime.tar.gz',
      digest: 'sha256:abc',
    };
    const updater = {
      check: vi.fn(async () => info),
      downloadAndInstall: vi.fn(async () => makeValidRuntime(resourcesDir)),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({ resourcesDir, updater, platform: 'win32' })).resolves.toMatchObject({
      status: 'ready',
      source: 'downloaded',
    });
    expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a cached runtime whose Node engine excludes this Electron runtime', async () => {
    const resourcesDir = tempRuntimeDir();
    makeValidRuntime(resourcesDir, '>=25.0.0');
    const info = {
      available: true,
      latestVersion: '0.2.1-alpha.2',
      assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.2/runtime.tar.gz',
      digest: 'sha256:abc',
    };
    const updater = {
      check: vi.fn(async () => info),
      downloadAndInstall: vi.fn(async () => makeValidRuntime(resourcesDir)),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({ resourcesDir, updater, platform: 'win32' })).resolves.toMatchObject({
      status: 'ready',
      source: 'downloaded',
    });
    expect(updater.check).toHaveBeenCalledTimes(1);
    expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('replaces an otherwise valid cached runtime older than the packaged minimum', async () => {
    const resourcesDir = tempRuntimeDir();
    makeValidRuntime(resourcesDir, undefined, '0.1.3-alpha.1');
    const info = {
      available: true,
      latestVersion: '0.2.1-alpha.2',
      assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.2/runtime.tar.gz',
      digest: 'sha256:abc',
    };
    const updater = {
      check: vi.fn(async () => info),
      downloadAndInstall: vi.fn(async () => makeValidRuntime(resourcesDir)),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({
      resourcesDir,
      updater,
      platform: 'win32',
      requirements: compatibleRequirements,
    })).resolves.toMatchObject({ status: 'ready', version: '0.2.1-alpha.2', source: 'downloaded' });
    expect(updater.check).toHaveBeenCalledTimes(1);
    expect(updater.check).toHaveBeenCalledWith(compatibleRequirements.minimumVersion);
    expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('rejects cached alpha4 and requests only the digest-pinned alpha5 runtime', async () => {
    const resourcesDir = tempRuntimeDir();
    makeValidRuntime(resourcesDir, undefined, '0.2.1-alpha.4');
    const requirements = { ...compatibleRequirements, minimumVersion: '0.2.1-alpha.5' };
    const info = {
      available: true,
      latestVersion: '0.2.1-alpha.5',
      assetName: 'deepseek-harness-runtime-0.2.1-alpha.5-win32-x64.tar.gz',
      assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.4/deepseek-harness-runtime-0.2.1-alpha.5-win32-x64.tar.gz',
      digest: `sha256:${'a'.repeat(64)}`,
    };
    const updater = {
      check: vi.fn(async () => info),
      downloadAndInstall: vi.fn(async (_release: typeof info) => makeValidRuntime(resourcesDir, undefined, '0.2.1-alpha.5')),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({ resourcesDir, updater, platform: 'win32', requirements })).resolves.toMatchObject({
      status: 'ready', version: '0.2.1-alpha.5', source: 'downloaded',
    });
    expect(updater.check).toHaveBeenCalledTimes(1);
    expect(updater.check).toHaveBeenCalledWith('0.2.1-alpha.5');
    expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(updater.downloadAndInstall).toHaveBeenCalledWith(info, undefined, requirements);
  });

  it('fails closed when alpha5 is unavailable without deleting the cached alpha4 runtime', async () => {
    const resourcesDir = tempRuntimeDir();
    makeValidRuntime(resourcesDir, undefined, '0.2.1-alpha.4');
    const updater = {
      check: vi.fn(async () => ({
        available: false,
        error: 'No harness runtime asset for packaged version 0.2.1-alpha.5 (win32-x64)',
      })),
      downloadAndInstall: vi.fn(),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({
      resourcesDir,
      updater,
      platform: 'win32',
      requirements: { ...compatibleRequirements, minimumVersion: '0.2.1-alpha.5' },
    })).rejects.toThrow(/No harness runtime asset for packaged version 0\.2\.1-alpha\.5/);
    expect(readFileSync(join(resourcesDir, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).toBe('// cli');
    expect(JSON.parse(readFileSync(join(resourcesDir, 'runtime-manifest.json'), 'utf8')).version).toBe('0.2.1-alpha.4');
    expect(updater.downloadAndInstall).not.toHaveBeenCalled();
  });

  it('rejects a release below the packaged minimum before downloading its archive', async () => {
    const resourcesDir = tempRuntimeDir();
    const updater = {
      check: vi.fn(async () => ({
        available: true,
        latestVersion: '0.1.3-alpha.1',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.2/runtime.tar.gz',
        digest: 'sha256:abc',
      })),
      downloadAndInstall: vi.fn(),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({
      resourcesDir,
      updater,
      platform: 'win32',
      requirements: compatibleRequirements,
    })).rejects.toThrow(/0\.1\.3-alpha\.1.*below.*0\.2\.1-alpha\.2/);
    expect(updater.downloadAndInstall).not.toHaveBeenCalled();
  });

  it('repairs a cached runtime built for a different Electron module ABI', async () => {
    const resourcesDir = tempRuntimeDir();
    makeValidRuntime(resourcesDir, undefined, '0.2.1-alpha.2', '133');
    const info = {
      available: true,
      latestVersion: '0.2.1-alpha.2',
      assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.2/runtime.tar.gz',
      digest: 'sha256:abc',
    };
    const updater = {
      check: vi.fn(async () => info),
      downloadAndInstall: vi.fn(async () => makeValidRuntime(resourcesDir)),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({
      resourcesDir,
      updater,
      platform: 'win32',
      requirements: compatibleRequirements,
    })).resolves.toMatchObject({ status: 'ready', source: 'downloaded' });
    expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it('never reports readiness for a downloaded runtime with a different Electron module ABI', async () => {
    const resourcesDir = tempRuntimeDir();
    const info = {
      available: true,
      latestVersion: '0.2.1-alpha.2',
      assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.2/runtime.tar.gz',
      digest: 'sha256:abc',
    };
    const updater = {
      check: vi.fn(async () => info),
      downloadAndInstall: vi.fn(async () => makeValidRuntime(resourcesDir, undefined, '0.2.1-alpha.2', '133')),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({
      resourcesDir,
      updater,
      platform: 'win32',
      requirements: compatibleRequirements,
    })).rejects.toThrow(new RegExp(`133.*NODE_MODULE_VERSION ${process.versions.modules}`, 'i'));
  });

  it('refuses a downloaded runtime that cannot run under Electron before reporting readiness', async () => {
    const resourcesDir = tempRuntimeDir();
    const info = {
      available: true,
      latestVersion: '0.2.1-alpha.2',
      assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.2/runtime.tar.gz',
      digest: 'sha256:abc',
    };
    const updater = {
      check: vi.fn(async () => info),
      downloadAndInstall: vi.fn(async () => makeValidRuntime(resourcesDir, '>=25.0.0')),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({ resourcesDir, updater, platform: 'win32' })).rejects.toThrow(
      /does not satisfy DSH engines\.node >=25\.0\.0/,
    );
  });

  it('fails before runtime start when no compatible release asset is available', async () => {
    const resourcesDir = tempRuntimeDir();
    const updater = {
      check: vi.fn(async () => ({ available: false, error: 'No compatible runtime asset' })),
      downloadAndInstall: vi.fn(),
    };
    const { ensureHarnessRuntime } = await import('../src/main/harness-bootstrap.js');

    await expect(ensureHarnessRuntime({ resourcesDir, updater, platform: 'win32' })).rejects.toThrow(/No compatible runtime asset/);
    expect(updater.downloadAndInstall).not.toHaveBeenCalled();
  });
});
