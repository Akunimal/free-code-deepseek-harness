import { describe, expect, it, vi } from 'vitest';
import { checkUpstreamUpdate, createUpdateService, type UpdaterAdapter } from '../src/main/updater.js';

describe('update service', () => {
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
