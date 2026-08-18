export interface UpdateInfo {
  version?: string;
  releaseName?: string;
}

export interface UpdaterAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{ updateInfo?: UpdateInfo } | null>;
  quitAndInstall(): void;
}

export interface UpdateService {
  readonly enabled: boolean;
  check(): Promise<{ status: 'disabled' | 'checked' | 'failed'; info?: UpdateInfo; error?: string }>;
  install(): void;
}

export interface UpdateServiceOptions {
  enabled?: boolean;
  adapter?: UpdaterAdapter;
  log?: (message: string, details?: unknown) => void;
}

/** Updates are opt-in. When enabled, electron-updater is loaded lazily so a
 * development checkout and an offline build never need a release service. */
export function createUpdateService(options: UpdateServiceOptions = {}): UpdateService {
  let adapter = options.adapter;
  const enabled = options.enabled === true;
  const log = options.log ?? (() => {});

  return {
    enabled,
    async check() {
      if (!enabled) return { status: 'disabled' };
      try {
        adapter ??= await loadElectronUpdater();
        adapter.autoDownload = false;
        adapter.autoInstallOnAppQuit = true;
        const result = await adapter.checkForUpdates();
        log('update check completed', result?.updateInfo);
        return { status: 'checked', info: result?.updateInfo };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log('update check failed', message);
        return { status: 'failed', error: message };
      }
    },
    install() {
      if (!enabled) return;
      adapter?.quitAndInstall();
    },
  };
}

async function loadElectronUpdater(): Promise<UpdaterAdapter> {
  const dynamicImport = new Function('return import("electron-updater")') as () => Promise<{ autoUpdater: UpdaterAdapter }>;
  const module = await dynamicImport();
  return module.autoUpdater;
}
