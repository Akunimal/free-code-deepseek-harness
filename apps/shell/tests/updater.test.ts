import { describe, expect, it, vi } from 'vitest';
import { createUpdateService, type UpdaterAdapter } from '../src/main/updater.js';

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
      quitAndInstall: vi.fn(),
    };
    const service = createUpdateService({ enabled: true, adapter });
    await expect(service.check()).resolves.toEqual({ status: 'checked', info: { version: '0.2.0' } });
    expect(adapter.autoDownload).toBe(false);
    expect(adapter.autoInstallOnAppQuit).toBe(true);
    service.install();
    expect(adapter.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
