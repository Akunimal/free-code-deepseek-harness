import type { HarnessUpdateInfo, HarnessUpdaterAdapter } from './harness-updater.js';

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
  harness?: HarnessUpdateInfo;
  upstream?: UpstreamUpdateInfo;
  error?: string;
}

export interface UpdaterAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{ updateInfo?: UpdateInfo } | null>;
  downloadUpdate?: () => Promise<unknown>;
  quitAndInstall(forceRunAfterInstall?: boolean): void;
}

export interface UpdateService {
  readonly enabled: boolean;
  check(): Promise<UpdateCheckResult>;
  downloadAndInstall(): Promise<{ status: 'disabled' | 'installed' | 'failed'; error?: string }>;
  installHarness(info: HarnessUpdateInfo): Promise<{ status: 'disabled' | 'installed' | 'failed'; error?: string }>;
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
  harness?: HarnessUpdaterAdapter;
  log?: (message: string, details?: unknown) => void;
}

const DEFAULT_UPSTREAM_REPO = 'deepseek-ai/deepseek-harness';

/** Return true only when candidate is semantically newer than current. */
export function isNewerVersion(currentVersion?: string, candidateVersion?: string): boolean {
  if (!currentVersion || !candidateVersion) return false;
  const parse = (value: string): { numbers: number[]; prerelease: string[] | null } | null => {
    const match = value.trim().replace(/^v/i, '').match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/);
    if (!match) return null;
    return {
      numbers: match[1]!.split('.').map(Number),
      prerelease: match[2] ? match[2].split('.') : null,
    };
  };
  const current = parse(currentVersion);
  const candidate = parse(candidateVersion);
  if (!current || !candidate) return false;

  const length = Math.max(current.numbers.length, candidate.numbers.length);
  for (let index = 0; index < length; index += 1) {
    const left = current.numbers[index] ?? 0;
    const right = candidate.numbers[index] ?? 0;
    if (left !== right) return right > left;
  }

  // A stable release is newer than its own prereleases; a prerelease is not
  // newer than the corresponding stable release.
  if (current.prerelease === null && candidate.prerelease !== null) return false;
  if (current.prerelease !== null && candidate.prerelease === null) return true;
  if (!current.prerelease || !candidate.prerelease) return false;

  const preLength = Math.max(current.prerelease.length, candidate.prerelease.length);
  for (let index = 0; index < preLength; index += 1) {
    const left = current.prerelease[index];
    const right = candidate.prerelease[index];
    if (left === right) continue;
    if (left === undefined) return true;
    if (right === undefined) return false;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) return Number(right) > Number(left);
    if (leftNumeric !== rightNumeric) return !rightNumeric;
    return right > left;
  }
  return false;
}

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

/** The shell owns the background schedule. This service only performs one
 * resilient check at a time and leaves the UI responsible for presenting it. */
export function createUpdateService(options: UpdateServiceOptions = {}): UpdateService {
  let adapter = options.adapter;
  const enabled = options.enabled === true;
  const checkReleases = options.checkReleases !== false;
  const log = options.log ?? (() => {});
  let checkInFlight: Promise<UpdateCheckResult> | null = null;

  return {
    enabled,
    check() {
      if (!enabled) return Promise.resolve({ status: 'disabled' as const });
      if (checkInFlight) return checkInFlight;

      const run = (async (): Promise<UpdateCheckResult> => {
        const upstream = options.upstreamCommit || options.fetchImpl
          ? await checkUpstreamUpdate(options.upstreamCommit, options.fetchImpl, options.upstreamRepo)
          : undefined;
        const harness = options.harness ? await options.harness.check() : undefined;
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

        const harnessError = harness?.error && !harness.available ? harness.error : undefined;
        if (releaseError && !upstream && !harness) return { status: 'failed', error: releaseError };
        if (!releaseError && !upstream && harnessError) return { status: 'failed', harness, error: harnessError };
        return {
          status: releaseError && !harness?.available ? 'failed' : 'checked',
          info,
          ...(harness ? { harness } : {}),
          upstream,
          ...(releaseError ? { error: releaseError } : {}),
        };
      })();
      checkInFlight = run;
      return run.finally(() => {
        if (checkInFlight === run) checkInFlight = null;
      });
    },
    async downloadAndInstall() {
      if (!enabled) return { status: 'disabled' };
      try {
        // electron-updater rejects downloadUpdate() unless its own check has
        // completed on the same adapter. Always perform a fresh preflight so
        // a stale indicator or a direct caller cannot bypass that contract.
        const checked = await this.check();
        if (!checked.info?.version) {
          return { status: 'failed', error: checked.error ?? 'No release update is ready to download' };
        }
        adapter ??= await loadElectronUpdater();
        adapter.autoDownload = false;
        adapter.autoInstallOnAppQuit = false;
        // Explicit download followed by quit-and-install with force.
        // Setting autoDownload=false avoids a double-download race; the
        // explicit downloadUpdate() ensures the installer lands in the
        // pending directory before quitAndInstall() spawns it.
        if (adapter.downloadUpdate) await adapter.downloadUpdate();
        log('update downloaded, initiating install', { version: checked.info.version });
        adapter.quitAndInstall(true);
        return { status: 'installed' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log('update download failed', message);
        return { status: 'failed', error: message };
      }
    },
    async installHarness(info) {
      if (!enabled) return { status: 'disabled' };
      if (!options.harness) return { status: 'failed', error: 'Harness-only updater is unavailable' };
      try {
        await options.harness.downloadAndInstall(info);
        log('harness runtime update installed', { version: info.latestVersion, asset: info.assetName });
        return { status: 'installed' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log('harness runtime update failed', message);
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
