export interface UpdateInfo {
  version?: string;
  releaseName?: string;
}

export interface UpstreamUpdateInfo {
  currentCommit?: string;
  latestCommit?: string;
  available: boolean;
  error?: string;
}

export interface UpdateCheckResult {
  status: 'disabled' | 'checked' | 'failed';
  info?: UpdateInfo;
  upstream?: UpstreamUpdateInfo;
  error?: string;
}

export interface UpdaterAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{ updateInfo?: UpdateInfo } | null>;
  downloadUpdate?: () => Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdateService {
  readonly enabled: boolean;
  check(): Promise<UpdateCheckResult>;
  downloadAndInstall(): Promise<{ status: 'disabled' | 'installed' | 'failed'; error?: string }>;
  install(): void;
}

export interface UpdateServiceOptions {
  enabled?: boolean;
  /** Keep release checks off in a source checkout; upstream checks still work. */
  checkReleases?: boolean;
  upstreamCommit?: string;
  upstreamRepo?: string;
  fetchImpl?: typeof fetch;
  adapter?: UpdaterAdapter;
  log?: (message: string, details?: unknown) => void;
}

const DEFAULT_UPSTREAM_REPO = 'deepseek-ai/deepseek-harness';

/** Compare the commit embedded in a packaged runtime with upstream's default
 * branch. This is deliberately an explicit check: no background network call
 * is made unless the caller opts into it. */
export async function checkUpstreamUpdate(
  currentCommit: string | undefined,
  fetchImpl: typeof fetch = fetch,
  upstreamRepo = DEFAULT_UPSTREAM_REPO,
): Promise<UpstreamUpdateInfo> {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${upstreamRepo}/commits/main`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'free-code-deepseek-harness-updater',
      },
    });
    if (!response.ok) throw new Error(`GitHub upstream check returned HTTP ${response.status}`);
    const payload = (await response.json()) as { sha?: unknown };
    const latestCommit = typeof payload.sha === 'string' ? payload.sha : undefined;
    if (!latestCommit) throw new Error('GitHub upstream response did not include a commit SHA');
    return {
      currentCommit,
      latestCommit,
      available: Boolean(currentCommit && currentCommit.toLowerCase() !== latestCommit.toLowerCase()),
    };
  } catch (error) {
    return {
      currentCommit,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Updates are explicit from the Help menu. Background checks are separately
 * controlled by the caller so portable/offline use remains deterministic. */
export function createUpdateService(options: UpdateServiceOptions = {}): UpdateService {
  let adapter = options.adapter;
  const enabled = options.enabled === true;
  const checkReleases = options.checkReleases !== false;
  const log = options.log ?? (() => {});

  return {
    enabled,
    async check() {
      if (!enabled) return { status: 'disabled' };

      const upstream = options.upstreamCommit || options.fetchImpl
        ? await checkUpstreamUpdate(options.upstreamCommit, options.fetchImpl, options.upstreamRepo)
        : undefined;
      let info: UpdateInfo | undefined;
      let releaseError: string | undefined;

      if (checkReleases) {
        try {
          adapter ??= await loadElectronUpdater();
          adapter.autoDownload = false;
          adapter.autoInstallOnAppQuit = true;
          const result = await adapter.checkForUpdates();
          info = result?.updateInfo;
          log('update check completed', info);
        } catch (error) {
          releaseError = error instanceof Error ? error.message : String(error);
          log('update check failed', releaseError);
        }
      }

      if (releaseError && !upstream) return { status: 'failed', error: releaseError };
      return {
        status: releaseError ? 'failed' : 'checked',
        info,
        upstream,
        ...(releaseError ? { error: releaseError } : {}),
      };
    },
    async downloadAndInstall() {
      if (!enabled) return { status: 'disabled' };
      try {
        adapter ??= await loadElectronUpdater();
        adapter.autoDownload = true;
        adapter.autoInstallOnAppQuit = true;
        if (adapter.downloadUpdate) await adapter.downloadUpdate();
        adapter.quitAndInstall();
        return { status: 'installed' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log('update download failed', message);
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
  const dynamicImport = new Function('return import("electron-updater")') as () => Promise<ElectronUpdaterModule>;
  return resolveUpdaterAdapter(await dynamicImport());
}

type ElectronUpdaterModule = {
  autoUpdater?: UpdaterAdapter;
  default?: {
    autoUpdater?: UpdaterAdapter;
  };
};

/** electron-updater is CommonJS and Electron's dynamic import exposes its
 * singleton under `default.autoUpdater`; some loaders also provide the named
 * export. Accept both shapes so the menu check works in packaged builds. */
export function resolveUpdaterAdapter(module: ElectronUpdaterModule): UpdaterAdapter {
  const adapter = module.autoUpdater ?? module.default?.autoUpdater;
  if (!adapter) throw new Error('electron-updater did not expose autoUpdater');
  return adapter;
}
