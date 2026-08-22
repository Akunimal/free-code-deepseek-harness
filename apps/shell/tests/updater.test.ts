import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { checkUpstreamUpdate, createUpdateService, resolveUpdaterAdapter, type UpdaterAdapter } from '../src/main/updater.js';
import { checkHarnessRelease, harnessAssetName, installHarnessRuntime } from '../src/main/harness-updater.js';

describe('update service', () => {
  it('resolves electron-updater from both CommonJS interop shapes', () => {
    const adapter = { autoDownload: false, autoInstallOnAppQuit: false, checkForUpdates: vi.fn(), quitAndInstall: vi.fn() } as UpdaterAdapter;
    expect(resolveUpdaterAdapter({ default: { autoUpdater: adapter } })).toBe(adapter);
    expect(resolveUpdaterAdapter({ autoUpdater: adapter })).toBe(adapter);
  });

  it('is disabled by default and never invokes an adapter', async () => {
    const adapter = { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() } as unknown as UpdaterAdapter;
    const service = createUpdateService({ adapter });
    expect(service.enabled).toBe(false);
    expect(await service.check()).toEqual({ status: 'disabled' });
    service.install();
    expect(adapter.checkForUpdates).not.toHaveBeenCalled();
    expect(adapter.quitAndInstall).not.toHaveBeenCalled();
  });

  it('checks without auto-downloading and reports update metadata', async () => {
    const adapter: UpdaterAdapter = {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.2.0' } })),
      downloadUpdate: vi.fn(async () => undefined),
      quitAndInstall: vi.fn(),
    };
    const service = createUpdateService({ enabled: true, adapter });
    await expect(service.check()).resolves.toEqual({ status: 'checked', info: { version: '0.2.0' } });
    expect(adapter.autoDownload).toBe(false);
    expect(adapter.autoInstallOnAppQuit).toBe(true);
    service.install();
    expect(adapter.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('downloads a confirmed release before asking electron to install it', async () => {
    const adapter: UpdaterAdapter = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.2.0' } })),
      downloadUpdate: vi.fn(async () => undefined),
      quitAndInstall: vi.fn(),
    };
    const service = createUpdateService({ enabled: true, adapter });
    await expect(service.downloadAndInstall()).resolves.toEqual({ status: 'installed' });
    expect(adapter.autoDownload).toBe(true);
    expect(adapter.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(adapter.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('detects a newer upstream commit without downloading a release', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ sha: 'new-upstream-sha' }), { status: 200 }));
    await expect(checkUpstreamUpdate('old-upstream-sha', fetchImpl)).resolves.toMatchObject({
      currentCommit: 'old-upstream-sha',
      latestCommit: 'new-upstream-sha',
      available: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/deepseek-ai/deepseek-harness/commits/main',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('selects a platform-specific Harness runtime asset', async () => {
    const assetName = harnessAssetName('0.1.8', 'win32', 'x64');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      tag_name: 'v0.1.8',
      assets: [{ name: assetName, browser_download_url: `https://example.test/${assetName}`, digest: 'sha256:abc' }],
    }), { status: 200 }));
    await expect(checkHarnessRelease('0.1.7', 'win32', 'x64', fetchImpl)).resolves.toMatchObject({
      latestVersion: '0.1.8',
      assetName,
      assetUrl: `https://example.test/${assetName}`,
      available: true,
    });
  });

  it('uses the Harness asset version when the app release tag has a different version', async () => {
    const assetName = harnessAssetName('0.1.1-rc.2', 'win32', 'x64');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      tag_name: 'v0.1.7',
      assets: [{ name: assetName, browser_download_url: `https://example.test/${assetName}` }],
    }), { status: 200 }));
    await expect(checkHarnessRelease('0.1.0', 'win32', 'x64', fetchImpl)).resolves.toMatchObject({
      latestVersion: '0.1.1-rc.2',
      assetName,
      available: true,
    });
  });

  it('installs a Harness-only update through its dedicated adapter', async () => {
    const install = vi.fn(async () => undefined);
    const service = createUpdateService({
      enabled: true,
      harness: { check: vi.fn(), downloadAndInstall: install },
    });
    const info = { currentVersion: '0.1.7', latestVersion: '0.1.8', available: true };
    await expect(service.installHarness(info)).resolves.toEqual({ status: 'installed' });
    expect(install).toHaveBeenCalledWith(info);
  });

  it('atomically installs the Harness and its runtime manifest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-test-'));
    try {
      const resources = join(root, 'resources');
      const archiveRoot = join(root, 'archive-root');
      const archivePath = join(root, 'harness.tar.gz');
      for (const base of [resources, archiveRoot]) mkdirSync(base, { recursive: true });
      mkdirSync(join(resources, 'dsh', 'apps', 'cli', 'lib'), { recursive: true });
      mkdirSync(join(archiveRoot, 'dsh', 'apps', 'cli', 'lib'), { recursive: true });
      writeFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'old');
      writeFileSync(join(resources, 'runtime-manifest.json'), JSON.stringify({ version: 'old', cli: 'dsh/apps/cli/lib/bin.js' }));
      writeFileSync(join(archiveRoot, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'new');
      writeFileSync(join(archiveRoot, 'runtime-manifest.json'), JSON.stringify({ version: 'new', cli: 'dsh/apps/cli/lib/bin.js' }));
      const archive = spawnSync('tar', ['-czf', archivePath, '-C', archiveRoot, 'dsh', 'runtime-manifest.json'], { windowsHide: true });
      expect(archive.status).toBe(0);
      const bytes = readFileSync(archivePath);

      await installHarnessRuntime(
        { currentVersion: 'old', latestVersion: 'new', assetUrl: 'https://example.test/harness.tar.gz', available: true },
        resources,
        vi.fn(async () => new Response(bytes, { status: 200 })),
      );

      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).toBe('new');
      expect(JSON.parse(readFileSync(join(resources, 'runtime-manifest.json'), 'utf8')).version).toBe('new');
      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).not.toBe('old');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns upstream status even if a release check is unavailable', async () => {
    const adapter: UpdaterAdapter = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => { throw new Error('offline'); }),
      quitAndInstall: vi.fn(),
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ sha: 'new-sha' }), { status: 200 }));
    const service = createUpdateService({ enabled: true, adapter, upstreamCommit: 'old-sha', fetchImpl });
    await expect(service.check()).resolves.toMatchObject({
      status: 'failed',
      upstream: { available: true, latestCommit: 'new-sha' },
    });
  });
});
