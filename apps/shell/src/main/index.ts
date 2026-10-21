import { app, BrowserWindow, Menu, Tray, WebContentsView, nativeImage, Notification, dialog, screen, session } from 'electron';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { launchHidden, launchHiddenSync } from './freecode-launcher.js'
import { headlessHostPolicy } from './headless-host-policy.js';
import type { McpRuntimeStatus } from '@freecode/shared-types';
import { createShellRuntime, ShellRuntime } from './runtime.js';
import { createSecretStore } from './secret-store.js';
import { seedProviders } from './provider-seeder.js';
import { refreshModels, ModelCatalog, shouldRetryModelRefresh } from './model-refresher.js';
import { createModelCatalogRefreshState } from './model-refresh-state.js';
import { registerIpc } from './ipc.js';
import { isTrustedHarnessNavigation, isTrustedRendererInvocation as isTrustedRendererCall } from './renderer-security.js';
import { createSingleFlight } from './single-flight.js';
import { nodeRuntimeEnv, resolveHarnessRuntimeDir, resolveNodePath, resolveResourcesDir } from './resource-paths.js';
import { createAppLogger, type AppLogger } from './logger.js';
import { createUpdateService, isNewerVersion, type UpdateCheckResult, type UpdateService } from './updater.js';
import {
  createHarnessUpdater,
  readHarnessRuntimeRequirements,
  type HarnessDownloadProgress,
} from './harness-updater.js';
import { ensureHarnessRuntime } from './harness-bootstrap.js';
import { createEmbeddedBrowser, type EmbeddedBrowser } from './embedded-browser.js';
import { createDialogBridge, type DialogBridge } from './dialog-bridge.js';
import { buildHarnessExtraEnv } from './harness-env.js';
import { awaitHarnessLayout, formatPreflightFailure } from './preflight.js';
import { ensureUvxCommand } from './uvx-bootstrap.js';
import { initLocale, setLocale as setNativeLocale, t } from './i18n.js';
import { shouldNotifyBackendState, type BackendState } from './backend-state.js';
import { cleanupStaleLoopbackCookies } from './loopback-cookies.js';
import {
  LifecycleManager,
  acquireSingletonLock,
  requestElectronSingleInstance,
} from './lifecycle-manager.js';
import {
  UPDATE_INDICATOR_HEIGHT,
  UPDATE_INDICATOR_WIDTH,
  renderUpdateIndicatorHtml,
} from './update-indicator-html.js';

/**
 * Electron main — wires the runtime (pool -> LB -> harness), the native
 * window wrapping the harness webview and tray.
 */

// Packaged Electron has no attached console. On Windows the detached
// stdout/stderr pipe can report `write EOF` while a console call is flushing;
// that error must never become an uncaught main-process exception. Structured
// application logs are the authoritative diagnostic sink.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err: NodeJS.ErrnoException) => {
    // Intentionally swallow every error from these optional diagnostic pipes.
    // Electron's GUI process remains alive even if its inherited console was
    // closed by the launcher or by Windows.
    void err;
  });
}

app.disableHardwareAcceleration();

const isDev = !app.isPackaged;

// ---- resource paths ----
function resourcesDir(): string {
  return resolveResourcesDir({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
}

function configurePortableDataDir(): void {
  if (!app.isPackaged) return;
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR ?? process.env.FREECODE_PORTABLE_DIR;
  if (portableDir) {
    // electron-builder's Windows portable target supplies PORTABLE_EXECUTABLE_DIR.
    // Keeping data beside the executable makes the portable artifact movable as
    // one folder and avoids requiring a machine-wide install or profile setup.
    app.setPath('userData', resolve(portableDir, 'data'));
  }
}

function isPortable(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR ?? process.env.FREECODE_PORTABLE_DIR);
}

function writeInstallMarker(userDataDir: string): void {
  try {
    writeFileSync(join(userDataDir, 'install-version.txt'), app.getVersion(), 'utf8');
  } catch {
    // Best effort; the marker is advisory.
  }
}

function checkStalePortable(): void {
  if (!app.isPackaged || !isPortable()) return;
  const currentVersion = app.getVersion();
  // The NSIS installer writes to the default userData (%APPDATA%), not the
  // portable data dir. If a newer installed version exists, warn.
  const systemDataDir = join(process.env.APPDATA ?? '', 'FreeCode DeepSeek Harness');
  const markerPath = join(systemDataDir, 'install-version.txt');
  try {
    if (!existsSync(markerPath)) return;
    const installedVersion = readFileSync(markerPath, 'utf8').trim();
    if (isNewerVersion(currentVersion, installedVersion)) {
      void dialog.showMessageBox({
        type: 'warning',
        title: t('portable.stale.title'),
        message: t('portable.stale.message', installedVersion, currentVersion),
      });
    }
  } catch {
    // Marker unreadable; skip.
  }
}

/** Locate a Node runtime for the harness child. Packaged apps ship node.exe
 *  next to the app; dev uses the system node from PATH. */
function findNode(): string {
  return resolveNodePath({
    packaged: app.isPackaged,
    explicit: process.env.FREECODE_NODE,
    executablePath: process.execPath,
  });
}

async function bootstrap(harnessDir: string): Promise<ShellRuntime> {
  const userDataDir = app.getPath('userData');
  appLogger?.logger.info({}, '[DEBUG-STARTUP] bootstrap 1/5 ensureUvxCommand starting');
  const uvxCommand = await ensureUvxCommand({
    platform: process.platform,
    userDataDir,
    log: (level, message, meta) => appLogger?.logger[level](meta ?? {}, message),
  });
  appLogger?.logger.info({ uvxCommand }, '[DEBUG-STARTUP] bootstrap 2/5 ensureUvxCommand OK');
  const resources = resourcesDir();
  if (process.platform === 'win32' && !dialogBridge) throw new Error('Headless Windows runtime requires the interactive dialog bridge');
  appLogger?.logger.info({}, '[DEBUG-STARTUP] bootstrap 3/5 createSecretStore starting');
  const secrets = await createSecretStore(userDataDir);
  appLogger?.logger.info({}, '[DEBUG-STARTUP] bootstrap 4/5 createSecretStore OK');
  appLogger?.logger.info({}, '[DEBUG-STARTUP] bootstrap 5/5 createShellRuntime starting');
  const runtime = await createShellRuntime({
    resourcesDir: resources,
    harnessDir,
    nodePath: findNode(),
    userDataDir,
    secrets,
    secretEnvNames: ['FREECODE_PUBLIC_KEY'],
    nodeEnv: nodeRuntimeEnv(app.isPackaged),
    extraEnv: buildHarnessExtraEnv(dialogBridge),
    uvxCommand,
    browserBridge: embeddedBrowser ? { endpoint: embeddedBrowser.endpoint, token: embeddedBrowser.token } : undefined,
    log: (level, msg, meta) => {
      const fn = level === 'error' || level === 'warn' ? level : 'info';
      appLogger?.logger[fn]?.(meta ?? {}, msg);
    },
  });
  appLogger?.logger.info({}, '[DEBUG-STARTUP] bootstrap DONE');
  return runtime;
}

let splashWindow: BrowserWindow | null = null;
let splashStatusText = '';
let mainWindow: BrowserWindow | null = null;
let harnessView: WebContentsView | null = null;
/**
 * Native windows owned by the shell (splash/main/overlay). Anything else
 * that appears — renderer popups that escaped a window-open handler, stray
 * tool windows — is destroyed on sight (see the browser-window-created
 * backstop): no product surface may flash native windows over the user's
 * work on Windows.
 */
const managedWindows = new Set<BrowserWindow>();
function trackManagedWindow(window: BrowserWindow): void {
  managedWindows.add(window);
  window.on('closed', () => {
    managedWindows.delete(window);
  });
}
function installPopupBackstop(): void {
  app.on('browser-window-created', (_event, window) => {
    // The event fires during `new BrowserWindow`, before our own creation
    // sites register — defer one tick so managed windows are recognized.
    setImmediate(() => {
      if (!managedWindows.has(window) && !window.isDestroyed()) {
        appLogger?.logger.warn({ title: window.getTitle() }, 'destroying unregistered popup window');
        window.close();
      }
    });
  });
}
let tray: Tray | null = null;
let runtime: ShellRuntime | null = null;
// Set once the catalog refresher exists; it refreshes the selector after
// Phoenix model discovery without restarting the local gateway.
// Shared with the selector so the loading state spans the complete refresh.
const catalogRefreshState = createModelCatalogRefreshState();
let appLogger: AppLogger | null = null;
let updateService: UpdateService | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let localUpdateRunning = false;
let embeddedBrowser: EmbeddedBrowser | null = null;
let dialogBridge: DialogBridge | null = null;
let updateIndicatorView: WebContentsView | null = null;
let latestUpdateResult: UpdateCheckResult | null = null;
let updateCheckInFlight: Promise<UpdateCheckResult | null> | null = null;
let updateIndicatorPlacement = 0;
type UpdateActivity = 'idle' | 'downloading' | 'installing';
let updateActivity: UpdateActivity = 'idle';
let shuttingDown = false;
let lifecycleMgr: LifecycleManager | null = null;
let refreshIntervalId: NodeJS.Timeout | null = null;
let refreshRetryTimer: NodeJS.Timeout | null = null;
const backendStates: Record<'catalog' | 'pool', BackendState> = { catalog: 'unknown', pool: 'unknown' };
const mcpLastStates = new Map<string, McpRuntimeStatus['state']>();

function mcpTraySummary(): string | null {
  const servers = runtime?.mcpState().servers ?? [];
  if (servers.length === 0) return null;
  const enabled = servers.filter((server) => server.enabled);
  const ready = enabled.filter((server) => server.runtime?.state === 'ready').length;
  return t('tray.mcpStatus', ready, enabled.length);
}

function reportMcpStatus(status: McpRuntimeStatus): void {
  const previous = mcpLastStates.get(status.serverId);
  mcpLastStates.set(status.serverId, status.state);
  updateTrayMenu();
  if (status.state !== 'failed' || previous === 'failed') return;
  try {
    new Notification({
      title: t('mcp.failed.title'),
      body: t('mcp.failed.message', status.serverId),
    }).show();
  } catch {
    // The tab, tray tooltip, and app log remain available when notifications are blocked.
  }
}

function reportBackendState(kind: 'catalog' | 'pool', state: Exclude<BackendState, 'unknown'>, detail?: string): void {
  const previous = backendStates[kind];
  backendStates[kind] = state;
  if (!shouldNotifyBackendState(previous, state, shuttingDown)) return;

  const key = state === 'down'
    ? `status.${kind}.down`
    : state === 'degraded'
      ? `status.${kind}.degraded`
      : `status.${kind}.ready`;
  const title = t(`${key}.title` as Parameters<typeof t>[0]);
  const message = t(`${key}.message` as Parameters<typeof t>[0]);
  const body = detail ? `${message}\n${detail}` : message;
  appLogger?.logger[state === 'ready' ? 'info' : 'warn']({ component: kind, state, detail }, 'backend state changed');
  try {
    new Notification({ title, body }).show();
  } catch {
    // Native notifications are best effort; the state remains in the log.
  }
}

// A zero-responder catalog is always actionable: nothing is selectable. The
// generic transition gate hides the first observation as startup settling,
// so this notifies directly, once per outage.
let noFreeModelsNotified = false;
function reportNoFreeModels(catalog: ModelCatalog): void {
  const anyResponder = Object.values(catalog.providers).some((provider) => provider.models.some((model) => model.responds));
  if (anyResponder) { noFreeModelsNotified = false; return; }
  if (noFreeModelsNotified || shuttingDown) return;
  noFreeModelsNotified = true;
  appLogger?.logger.warn({ component: 'catalog' }, 'no free model answered the catalog probe');
  try {
    const notification = new Notification({ title: t('status.models.none.title'), body: t('status.models.none.message') });
    notification.on('show', () => appLogger?.logger.info({ component: 'catalog' }, 'no-model notification shown'));
    notification.on('failed', (_event, error) => appLogger?.logger.warn({ component: 'catalog', error }, 'no-model notification failed'));
    notification.show();
  } catch (error) {
    appLogger?.logger.warn({ component: 'catalog', error: error instanceof Error ? error.message : String(error) }, 'no-model notification threw');
  }
}

function reportModelRefreshFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const readyWorkers = runtime?.workers().filter((worker) => worker.status === 'ready').length ?? 0;
  if (readyWorkers === 0) {
    reportBackendState('pool', 'down', message);
  } else {
    reportBackendState('catalog', 'down', message);
  }
}

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 280,
    frame: false,
    resizable: false,
    transparent: false,
    center: true,
    skipTaskbar: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f1117;color:#d7dae2;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;user-select:none;-webkit-app-region:drag}
h1{font-size:18px;font-weight:600;margin-bottom:8px}
p{font-size:13px;color:#9da4b3;margin-bottom:24px}
.spinner{width:36px;height:36px;border:3px solid #2a2f3a;border-top-color:#ff7a00;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<h1>FreeCode DeepSeek Harness</h1>
<p id="splash-status">${t('splash.loading')}</p>
<div class="spinner"></div>
</body></html>`;
  splashWindow.loadURL('data:text/html,' + encodeURIComponent(html));
  splashWindow.webContents.once('did-finish-load', () => updateSplashStatus(splashStatusText || t('splash.loading')));
  splashWindow.on('closed', () => { splashWindow = null; });
  trackManagedWindow(splashWindow);
}

function updateSplashStatus(message: string): void {
  splashStatusText = message;
  const win = splashWindow;
  if (!win || win.isDestroyed()) return;
  const safeMessage = JSON.stringify(message);
  void win.webContents.executeJavaScript(`document.getElementById('splash-status').textContent = ${safeMessage}`).catch(() => {});
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createMainWindow(harnessUrl: string): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'FreeCode DeepSeek Harness',
    // No `webPreferences` here: the harness page renders in a nested
    // WebContentsView so we can shrink it when the embedded browser opens.
    // The mainWindow's built-in webContents stays unused (blank).
  });
  trackManagedWindow(mainWindow);
  // The harness renders in a WebContentsView child of contentView so its
  // bounds can be resized independently. Loading the harness into
  // mainWindow.webContents (classic BrowserWindow.loadURL) would fill the
  // entire content area with no way to shrink it — the embedded browser
  // panel would then draw ON TOP of the harness, covering conversation
  // text (F1 postmortem: v0.2.2 "reflow" fix silently no-op'd because
  // BrowserWindow.webContents does not appear in contentView.children).
  const preloadScriptPath = resolve(import.meta.dirname, '../preload/index.js');
  appLogger?.logger.info({ preloadScriptPath, exists: existsSync(preloadScriptPath) }, 'harness preload script check');
  harnessView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadScriptPath,
    },
  });
  // DSH detects the desktop host through its own global. FreeCode has no
  // dshDesktop global, so mark the page through its user agent, set before
  // any harness script runs. DSH gates its desktop-only first-run prompts on it.
  harnessView.webContents.setUserAgent(`${harnessView.webContents.getUserAgent()} FreeCodeDesktop/${app.getVersion()}`);
  mainWindow.contentView.addChildView(harnessView);
  const size = mainWindow.getContentSize();
  harnessView.setBounds({ x: 0, y: 0, width: size[0] ?? 1280, height: size[1] ?? 820 });
  // Renderer popups (window.open / target=_blank) from the harness page must
  // never become native on-top windows: they flash over the user's work and
  // close within a second. Deny them all; explicit browsing belongs to the
  // embedded browser panel, opened deliberately from the menu.
  harnessView.webContents.setWindowOpenHandler(() => {
    appLogger?.logger.warn({}, 'denied harness popup window.open');
    return { action: 'deny' };
  });
  const trustedHarnessUrl = (): string => runtime?.supervisor.currentUrl ?? harnessUrl;
  const blockUntrustedNavigation = (event: Electron.Event, url: string): void => {
    if (!isTrustedHarnessNavigation(url, trustedHarnessUrl())) event.preventDefault();
  };
  harnessView.webContents.on('will-navigate', (e, u) => blockUntrustedNavigation(e, u));
  harnessView.webContents.on('will-redirect', (e, u) => blockUntrustedNavigation(e, u));
  if (isDev || process.env.FREECODE_DEVTOOLS === '1') {
    harnessView.webContents.openDevTools({ mode: 'detach' });
  }
  void cleanupStaleLoopbackCookies(appLogger?.logger).finally(() => {
    if (harnessView && !harnessView.webContents.isDestroyed()) {
      void harnessView.webContents.loadURL(harnessUrl);
    }
  });
  embeddedBrowser?.attachWindow(mainWindow, harnessView);
  ensureUpdateIndicator();
  mainWindow.on('resize', updateUpdateIndicatorBounds);
  // Intercept X-click: hide to tray instead of destroying. Keeps the harness
  // webContents alive so tray "Show" / double-click restores in one gesture
  // (F2 postmortem: X destroyed the window and tray show() was a no-op on
  // the null reference). shuttingDown lets a real quit through.
  mainWindow.on('close', (event) => {
    if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  // Keep harnessView filling the mainWindow content area when the browser
  // is hidden. When the browser is visible, embedded-browser owns bounds.
  const resyncHarnessBounds = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || !harnessView) return;
    // embedded-browser reacts to resizes separately; only touch bounds
    // here when the browser is not managing them.
    if (!embeddedBrowserVisible()) {
      const s = mainWindow.getContentSize();
      harnessView.setBounds({ x: 0, y: 0, width: s[0] ?? 1280, height: s[1] ?? 820 });
    }
    updateUpdateIndicatorBounds();
  };
  mainWindow.on('resize', resyncHarnessBounds);
  // Display scale/placement changes (multi-monitor moves, DPI switches) do
  // not always fire resize with fresh content sizes; stale harnessView
  // bounds then clip web content (e.g. the sidebar foot). Re-sync there too.
  screen.on('display-metrics-changed', resyncHarnessBounds);
  harnessView.webContents.on('did-finish-load', updateUpdateIndicatorBounds);
  mainWindow.on('closed', () => {
    screen.removeListener('display-metrics-changed', resyncHarnessBounds);
    updateIndicatorView = null;
    harnessView = null;
    mainWindow = null;
  });
}

/** Best-effort peek at the embedded browser panel's visibility for bounds
 *  arbitration. The browser owns its own resize handler; the shell only needs
 *  to know whether to defer or fill on its own resize event. */
function embeddedBrowserVisible(): boolean {
  return embeddedBrowser?.publicState().visible === true;
}

/** Show the main window from the tray, or recreate it if the user
 *  destroyed it (Task Manager, hard quit, etc.). Also focuses. */
function showMainWindowFromTray(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }
  const url = runtime?.supervisor.currentUrl;
  if (url) createMainWindow(url);
}

function updateIsAvailable(result: UpdateCheckResult | null): boolean {
  return Boolean(
    result?.harness?.available
    || isNewerVersion(app.getVersion(), result?.info?.version)
    || (isDev && result?.upstream?.available),
  );
}

function updateUpdateIndicatorBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !updateIndicatorView) return;
  const placement = ++updateIndicatorPlacement;
  const height = mainWindow.getContentSize()[1] ?? 820;
  const visible = updateIsAvailable(latestUpdateResult);
  if (!visible) {
    updateIndicatorView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }

  // The settings trigger owns the sidebar footer geometry. Use a right-side
  // slot in its row rather than fixed x=6, which sits on top of the gear in
  // the wide sidebar. The fallback is only used before the page has mounted.
  const fallback = {
    x: 230,
    y: Math.max(0, height - UPDATE_INDICATOR_HEIGHT - 7),
    width: UPDATE_INDICATOR_WIDTH,
    height: UPDATE_INDICATOR_HEIGHT,
  };
  updateIndicatorView.setBounds(fallback);
  // Query the DOM in the harness WebContentsView (not mainWindow.webContents,
  // which is now blank since the harness renders in a nested view).
  const harnessContents = harnessView?.webContents;
  if (!harnessContents || harnessContents.isDestroyed()) return;
  void harnessContents.executeJavaScript(`(() => {
    const trigger = document.querySelector('button[aria-haspopup="dialog"]');
    if (!(trigger instanceof HTMLElement)) return null;
    const rect = trigger.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height };
  })()`, true).then((anchor: { left: number; right: number; top: number; width: number; height: number } | null) => {
    if (placement !== updateIndicatorPlacement || !mainWindow || mainWindow.isDestroyed() || !updateIndicatorView) return;
    if (!anchor) return;
    // harnessView bounds are 0,0 when the browser is hidden, but shift when
    // the browser opens. Anchor the indicator relative to harnessView's
    // origin, not the whole window contentView, so it tracks the sidebar.
    const harnessBounds = harnessView?.getBounds() ?? { x: 0, y: 0 };
    const rail = anchor.width <= 60;
    const x = rail
      ? Math.round(harnessBounds.x + anchor.right + 6)
      : Math.round(harnessBounds.x + anchor.right - (UPDATE_INDICATOR_WIDTH + 6));
    const y = Math.round(harnessBounds.y + anchor.top + (anchor.height - UPDATE_INDICATOR_HEIGHT) / 2);
    updateIndicatorView.setBounds({
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: UPDATE_INDICATOR_WIDTH,
      height: UPDATE_INDICATOR_HEIGHT,
    });
  }).catch(() => undefined);
}

function refreshUpdateIndicator(): void {
  if (!updateIndicatorView || updateIndicatorView.webContents.isDestroyed()) return;
  void updateIndicatorView.webContents
    .loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(renderUpdateIndicatorHtml(t('update.indicator'))))
    .catch(() => undefined);
  updateUpdateIndicatorBounds();
}

function ensureUpdateIndicator(): void {
  if (!mainWindow || mainWindow.isDestroyed() || updateIndicatorView) return;
  updateIndicatorView = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  updateIndicatorView.setBackgroundColor('#00000000');
  mainWindow.contentView.addChildView(updateIndicatorView);
  updateIndicatorView.webContents.on('will-navigate', (event, url) => {
    if (url === 'freecode://updates/open') {
      event.preventDefault();
      void updateFromIndicator();
    } else {
      event.preventDefault();
    }
  });
  refreshUpdateIndicator();
}

async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  if (!updateService) return latestUpdateResult;
  if (updateCheckInFlight) return updateCheckInFlight;
  const run = (async (): Promise<UpdateCheckResult | null> => {
    try {
      latestUpdateResult = await updateService!.check();
      updateUpdateIndicatorBounds();
      return latestUpdateResult;
    } catch (error) {
      latestUpdateResult = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
      appLogger?.logger.warn({ err: error }, 'automatic update check failed');
      updateUpdateIndicatorBounds();
      return latestUpdateResult;
    }
  })();
  updateCheckInFlight = run;
  return run.finally(() => {
    if (updateCheckInFlight === run) updateCheckInFlight = null;
  });
}

async function updateFromIndicator(): Promise<void> {
  const result = await checkForUpdates();
  if (!result) return;
  await presentUpdateResult(result);
}

function bundledUpstreamCommit(resources: string): string | undefined {
  for (const manifestPath of [join(resources, 'runtime-manifest.json'), join(resources, 'freecode', 'runtime-manifest.json')]) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { upstreamCommit?: unknown };
      if (typeof manifest.upstreamCommit === 'string') return manifest.upstreamCommit;
    } catch {
      // A clean source checkout may not have a generated runtime yet.
    }
  }
  const result = launchHiddenSync({
    executable: 'git',
    args: ['log', '--all', '--format=%b', '--grep=git-subtree-dir: vendor/deepseek-harness'],
    cwd: projectRoot(),
    encoding: 'utf8',
  });
  const output = typeof result.stdout === 'string' ? result.stdout : '';
  const match = output.match(/git-subtree-split:\s*([0-9a-f]+)/i);
  return match?.[1];
}

function bundledHarnessVersion(resources: string): string | undefined {
  for (const manifestPath of [join(resources, 'runtime-manifest.json'), join(resources, 'freecode', 'runtime-manifest.json')]) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
      if (typeof manifest.version === 'string') return manifest.version;
    } catch {
      // A clean source checkout may not have a generated runtime yet.
    }
  }
  return undefined;
}

async function ensurePackagedHarnessRuntime(harnessRuntimeDir: string, staticResourcesDir: string): Promise<boolean> {
  const bootstrapUpdater = createHarnessUpdater({ resourcesDir: harnessRuntimeDir });
  let lastProgressAt = 0;
  let lastProgressBytes = 0;
  let lastPhase: HarnessDownloadProgress['phase'] | undefined;
  for (;;) {
    try {
      updateSplashStatus(t('splash.downloadingRuntime'));
      const requirements = readHarnessRuntimeRequirements(join(staticResourcesDir, 'runtime-manifest.json'));
      const result = await ensureHarnessRuntime({
        resourcesDir: harnessRuntimeDir,
        updater: bootstrapUpdater,
        requirements,
        onProgress: (progress) => {
          const now = Date.now();
          if (progress.phase === 'extract') {
            if (lastPhase !== 'extract') updateSplashStatus(t('splash.extractingRuntime'));
            lastPhase = progress.phase;
            return;
          }
          if (progress.phase !== lastPhase || now - lastProgressAt >= 500 ||
              (progress.receivedBytes ?? 0) - lastProgressBytes >= 8 * 1024 * 1024) {
            const received = progress.receivedBytes ?? 0;
            const progressText = progress.totalBytes
              ? ` (${(received / 1_048_576).toFixed(0)} / ${(progress.totalBytes / 1_048_576).toFixed(0)} MB)`
              : ` (${(received / 1_048_576).toFixed(0)} MB)`;
            updateSplashStatus(`${t('splash.downloadingRuntime')}${progressText}`);
            lastProgressAt = now;
            lastProgressBytes = received;
          }
          lastPhase = progress.phase;
        },
      });
      appLogger?.logger.info({ version: result.version, source: result.source }, 'DSH runtime ready');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appLogger?.logger.error({ err: error }, 'first-run DSH runtime setup failed');
      const choice = await dialog.showMessageBox({
        type: 'error',
        title: t('runtimeDownload.title'),
        message: t('runtimeDownload.message', message),
        buttons: [t('stuck.retry'), t('stuck.close')],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice.response !== 0) {
        closeSplash();
        app.quit();
        return false;
      }
      lastProgressAt = 0;
      lastProgressBytes = 0;
      lastPhase = undefined;
    }
  }
}

function projectRoot(): string {
  // dist/src/main -> repository root. This is used only by the source checkout
  // updater; packaged builds never execute the local rebuild path.
  return resolve(import.meta.dirname, '../../../../');
}

async function presentUpdateResult(result: UpdateCheckResult): Promise<void> {
  const service = updateService;
  if (!service) return;
  const harnessAvailable = result.harness?.available === true;
  const releaseAvailable = Boolean(result.info?.version);
  const upstreamAvailable = result.upstream?.available === true;

  if (harnessAvailable) {
    const version = result.harness?.latestVersion ?? t('version.new');
    const choice = await dialog.showMessageBox({
      type: 'info',
      title: t('update.harnessAvailable.title'),
      message: t('update.harnessAvailable.message', version),
      detail: t('update.harnessAvailable.detail'),
      buttons: [t('update.downloadHarness'), t('update.notNow')],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) {
      setUpdateActivity('downloading');
      notifyUpdateDownloading();
      try {
        const install = await service.installHarness(result.harness!);
        setUpdateActivity('idle');
        if (install.status === 'installed') {
          await dialog.showMessageBox({ type: 'info', title: t('update.harnessComplete.title'), message: t('update.harnessComplete.message') });
        } else {
          await dialog.showMessageBox({ type: 'error', title: t('update.failed.title'), message: install.error ?? t('update.failed.message') });
        }
      } catch (error) {
        setUpdateActivity('idle');
        const message = error instanceof Error ? error.message : String(error);
        await dialog.showMessageBox({ type: 'error', title: t('update.failed.title'), message });
      }
    }
    return;
  }

  if (releaseAvailable) {
    const version = result.info?.version ?? t('version.new');
    const suffix = upstreamAvailable ? t('update.available.upstreamSuffix') : '';
    const choice = await dialog.showMessageBox({
      type: 'info',
      title: t('update.available.title'),
      message: t('update.available.message', version) + suffix,
      detail: t('update.available.detail'),
      buttons: [t('update.download'), t('update.notNow')],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) {
      setUpdateActivity('downloading');
      notifyUpdateDownloading();
      try {
        const install = await service.downloadAndInstall();
        if (install.status === 'installed') {
          setUpdateActivity('installing');
          notifyUpdateInstalling();
        } else {
          setUpdateActivity('idle');
          await dialog.showMessageBox({ type: 'error', title: t('update.failed.title'), message: install.error ?? t('update.failed.message') });
        }
      } catch (error) {
        setUpdateActivity('idle');
        const message = error instanceof Error ? error.message : String(error);
        await dialog.showMessageBox({ type: 'error', title: t('update.failed.title'), message });
      }
    }
    return;
  }

  if (upstreamAvailable && isDev) {
    const choice = await dialog.showMessageBox({
      type: 'info',
      title: t('update.upstream.title'),
      message: t('update.upstream.message'),
      detail: t('update.upstream.detail'),
      buttons: [t('update.upstream.action'), t('update.notNow')],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) runLocalUpstreamUpdate();
    return;
  }

  if (upstreamAvailable) {
    await dialog.showMessageBox({
      type: 'info',
      title: t('update.upstreamOnly.title'),
      message: t('update.upstreamOnly.message'),
      detail: t('update.upstreamOnly.detail'),
    });
    return;
  }

  const details = [
    result.upstream?.error ? t('update.upstreamCheckError', result.upstream.error) : '',
    result.harness?.error ? t('update.harnessCheckError', result.harness.error) : '',
  ].filter(Boolean).join('\n\n');
  await dialog.showMessageBox({
    type: result.status === 'failed' ? 'warning' : 'info',
    title: result.status === 'failed' ? t('update.checkFailed.title') : t('update.noUpdates.title'),
    message: result.status === 'failed' ? (result.error ?? t('update.checkFailed.message')) : t('update.noUpdates.message'),
    detail: details.trim(),
  });
}

function runLocalUpstreamUpdate(): void {
  if (localUpdateRunning) return;
  localUpdateRunning = true;
  const script = resolve(projectRoot(), 'scripts/update-upstream-local.mjs');
  const node = resolveNodePath({ packaged: false });
  // Whitelist safe env vars — don't leak Electron internals or API keys to the
  // child process (matches the pattern used by harness-supervisor).
  const UPDATE_SAFE_ENV_KEYS = [
    'PATH', 'HOME', 'USER', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR',
    'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA',
    'APPDATA', 'COMMONPROGRAMFILES', 'ProgramData', 'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR',
    'GIT_CONFIG_NOSYSTEM', 'HOME', 'NODE_OPTIONS',
  ] as const;
  const safeEnv: Record<string, string> = {};
  for (const key of UPDATE_SAFE_ENV_KEYS) {
    const val = process.env[key];
    if (val !== undefined) safeEnv[key] = val;
  }
  safeEnv.CI = process.env.CI ?? 'true';
  const { proc: child } = launchHidden({
    executable: node,
    args: [script],
    cwd: projectRoot(),
    env: safeEnv,
    stdio: 'ignore',
    closeReason: 'local-update-exit',
  });
  child.once('error', (error: NodeJS.ErrnoException) => {
    localUpdateRunning = false;
    appLogger?.logger.error({ err: error }, 'local upstream update failed to start');
    void dialog.showMessageBox({ type: 'error', title: t('update.localFailed.title'), message: error.message });
  });
  child.once('close', (code: number | null) => {
    localUpdateRunning = false;
    if (code === 0) {
      void dialog.showMessageBox({ type: 'info', title: t('update.localComplete.title'), message: t('update.localComplete.message') });
    } else {
      void dialog.showMessageBox({ type: 'error', title: t('update.localIncomplete.title'), message: t('update.localIncomplete.message', code ?? t('version.unknown')) });
    }
  });
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [];
  if (process.platform === 'darwin') {
    template.push({ role: 'appMenu' });
  }
  template.push(
    { role: 'fileMenu', label: t('menu.file') },
    {
      label: t('menu.harness'),
      submenu: [
        {
          label: t('menu.restartHarness'),
          click: () => void runtime?.supervisor.restart(),
        },
        { type: 'separator' },
        { role: 'quit', label: t('menu.quit') },
      ],
    },
    {
      role: 'viewMenu',
      label: t('menu.view'),
      submenu: [
        { label: t('menu.embeddedBrowser'), click: () => void embeddedBrowser?.show() },
      ],
    },
    { role: 'windowMenu', label: t('menu.window') },
    {
      label: t('menu.help'),
      submenu: [
        { label: t('menu.about'), click: () => void import('electron').then(({ dialog }) => dialog.showMessageBox({ message: t('menu.aboutMessage', app.getVersion()) })) },
      ],
    },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function updateTrayMenu(): void {
  const activityLabel = updateActivity === 'downloading'
    ? t('tray.updateDownloading')
    : updateActivity === 'installing'
      ? t('tray.updateInstalling')
      : null;
  const mcpSummary = mcpTraySummary();
  tray?.setToolTip([activityLabel, mcpSummary].filter((value): value is string => value !== null).join(' · ') || t('tray.tooltip'));
  const activityItems: Electron.MenuItemConstructorOptions[] = activityLabel
    ? [{ label: activityLabel, enabled: false }, { type: 'separator' }]
    : [];
  const mcpItem = mcpSummary === null ? [] : [{ label: mcpSummary, enabled: false } satisfies Electron.MenuItemConstructorOptions, { type: 'separator' as const }];
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      ...activityItems,
      ...mcpItem,
      { label: t('tray.show'), click: () => showMainWindowFromTray() },
      {
        label: t('menu.restartHarness'),
        click: () => void runtime?.supervisor.restart(),
      },
      { type: 'separator' },
      { label: t('menu.quit'), click: () => app.quit() },
    ]),
  );
}

function setUpdateActivity(activity: UpdateActivity): void {
  updateActivity = activity;
  updateTrayMenu();
}

function notifyUpdateDownloading(): void {
  try {
    new Notification({
      title: t('update.downloading.title'),
      body: t('update.downloading.body'),
    }).show();
  } catch {
    // The tray tooltip/menu still exposes progress when native notifications
    // are unavailable (headless sessions, notification policy, or tests).
  }
}

function notifyUpdateInstalling(): void {
  try {
    new Notification({
      title: t('update.installing.title'),
      body: t('update.installing.body'),
    }).show();
  } catch {
    // The updater will still relaunch through electron-updater.
  }
}

function createTray(): void {
  const iconPath = join(resourcesDir(), 'tray.png');
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  updateTrayMenu();
  // Windows fires 'click' for single-click and 'double-click' for double;
  // both should restore. macOS uses tray-click on the menu bar icon. All
  // routes through showMainWindowFromTray so a destroyed window recreates.
  tray.on('click', () => showMainWindowFromTray());
  tray.on('double-click', () => showMainWindowFromTray());
}

/** Apply the web selector to all native surfaces without restarting FreeCode. */
function applyNativeLocale(value: 'zh' | 'en' | 'es'): void {
  setNativeLocale(value);
  buildMenu();
  updateTrayMenu();
  refreshUpdateIndicator();
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const REFRESH_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

app.whenReady().then(async () => {
  configurePortableDataDir();

  // ── Phase 4: Singleton enforcement ──────────────────────────────
  // File-based singleton lock catches stale locks from crashed instances
  const userDataDir = app.getPath('userData');
  const singletonResult = acquireSingletonLock(userDataDir);
  if (!singletonResult.locked) {
    app.quit();
    return;
  }

  // Electron's built-in single-instance lock handles the race where two
  // instances start simultaneously before either writes its lock file.
  const isPrimary = requestElectronSingleInstance((_event, argv, _cwd) => {
    // Second instance detected — focus the existing window and exit
    appLogger?.logger.info({ argv }, 'second instance detected, focusing existing');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  if (!isPrimary) {
    appLogger?.logger.warn({}, 'another FreeCode instance is already running, exiting');
    app.quit();
    return;
  }

  lifecycleMgr = new LifecycleManager({
    userDataDir,
    log: (level, msg, meta) => appLogger?.logger[level](meta ?? {}, msg),
  });

  initLocale(app.getLocale());
  // No native window outside splash/main/overlay may ever appear (Windows
  // focus-stealing flashes). Install before the first creation site.
  installPopupBackstop();
  createSplashWindow();
  if (app.isPackaged && !isPortable()) writeInstallMarker(userDataDir);
  checkStalePortable();
  appLogger = createAppLogger(join(userDataDir, 'logs'));
  if (process.platform === 'win32') headlessHostPolicy.configure(join(resourcesDir(), 'headless-host.exe'));
  appLogger.logger.info({ packaged: app.isPackaged, platform: process.platform }, 'shell starting');
  await cleanupStaleLoopbackCookies(appLogger?.logger);
  const resources = resourcesDir();
  const harnessRuntimeDir = resolveHarnessRuntimeDir({
    packaged: app.isPackaged,
    resourcesDir: resources,
    userDataDir,
  });
  if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir, resources))) return;
  // Preflight: fail loud with a specific message BEFORE creating the
  // supervisor. Otherwise a broken install surfaces as a mystery
  // "supervisor gave up" 30+ seconds later.
  //
  // Retry with grace: an auto-update relaunches the app in the window where
  // the NSIS setup has only just finished extracting 600+ node_modules dirs;
  // Windows disk buffering / indexing / AV scanning can make a freshly
  // written directory read as briefly empty. Retrying a few times absorbs
  // that settling window, while a genuinely broken install stays empty across
  // every attempt and still fails (the v0.2.5 auto-update false positive that
  // killed the app 98ms after relaunch).
  if (app.isPackaged) {
    const preflight = await awaitHarnessLayout({
      resourcesDir: resources,
      harnessDir: harnessRuntimeDir,
      attempts: 6,
      delayMs: 1_000,
      onRetry: (attempt, result) => {
        appLogger?.logger.warn({ attempt, missing: result.missing, warnings: result.warnings },
          'harness runtime preflight incomplete; retrying (install may be settling)');
      },
    });
    if (!preflight.ok) {
      const detail = formatPreflightFailure(preflight, t('preflight.reinstallHint'));
      appLogger.logger.error({ missing: preflight.missing, warnings: preflight.warnings },
        'harness runtime preflight failed after retries');
      closeSplash();
      dialog.showErrorBox(t('preflight.title'), detail);
      app.exit(1);
      return;
    }
  }
  const harnessUpdater = createHarnessUpdater({
    resourcesDir: harnessRuntimeDir,
    currentVersion: bundledHarnessVersion(harnessRuntimeDir),
  });
  updateService = createUpdateService({
    enabled: true,
    checkReleases: app.isPackaged,
    upstreamCommit: bundledUpstreamCommit(harnessRuntimeDir),
    harness: {
      check: harnessUpdater.check,
      downloadAndInstall: async (info) => {
        const supervisor = runtime?.supervisor;
        if (supervisor) await supervisor.stop();
        try {
          await harnessUpdater.downloadAndInstall(info);
        } finally {
          if (supervisor) await supervisor.start();
        }
      },
    },
    log: (message, details) => appLogger?.logger.info({ details }, message),
  });
  console.log('[DEBUG-STARTUP] 1/10 checkForUpdates starting');
  appLogger?.logger.info({}, '[DEBUG-STARTUP] 1/10 checkForUpdates starting');
  void checkForUpdates();
  console.log('[DEBUG-STARTUP] 2/10 checkForUpdates fired');
  appLogger?.logger.info({}, '[DEBUG-STARTUP] 2/10 checkForUpdates fired');
  updateTimer = setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1_000);
  updateTimer.unref();
  appLogger?.logger.info({}, '[DEBUG-STARTUP] 3/10 before createEmbeddedBrowser');
  try {
    embeddedBrowser = await createEmbeddedBrowser(userDataDir, () => mainWindow);
    appLogger?.logger.info({}, '[DEBUG-STARTUP] 4/10 createEmbeddedBrowser OK');
  } catch (error) {
    appLogger?.logger.error({ err: error }, '[DEBUG-STARTUP] 4/10 createEmbeddedBrowser FAILED');
    appLogger?.logger.warn({ err: error }, 'embedded browser unavailable; computer_use will report capability absence');
  }
  if (process.platform === 'win32') {
    appLogger?.logger.info({}, '[DEBUG-STARTUP] 5/10 before createDialogBridge');
    try {
      dialogBridge = await createDialogBridge(join(userDataDir, 'dsh-home'));
      appLogger?.logger.info({}, '[DEBUG-STARTUP] 6/10 createDialogBridge OK');
    } catch (error) {
      appLogger?.logger.error({ err: error }, '[DEBUG-STARTUP] 6/10 createDialogBridge FAILED');
      appLogger?.logger.warn({ err: error }, 'dialog bridge unavailable; directory picker falls back to koffi worker');
    }
  }
  appLogger?.logger.info({}, '[DEBUG-STARTUP] 7/10 before bootstrap()');
  runtime = await bootstrap(harnessRuntimeDir);
  appLogger?.logger.info({}, '[DEBUG-STARTUP] 8/10 bootstrap() OK');
  const phoenixUrl = runtime.phoenix.url;
  const phoenixApiKey = runtime.phoenix.apiKey;
  const phoenixModelIds = runtime.phoenix.modelIds;

  // The gateway URL is known now, while the DSH child has not started yet.
  // Clear stale/unsupported model IDs before its first settings read; otherwise
  // it can advertise a persisted route (for example x-preview-f) that the
  // gateway correctly rejects with an unsupported-protocol 400.
  seedProviders({
    homeDir: join(userDataDir, 'dsh-home'),
    lbBaseUrl: `${phoenixUrl}/v1`,
    modelIds: runtime.phoenix.modelIds,
    apiKeyEnv: 'FREECODE_PHOENIX_API_KEY',
  });

  // Register before start so MCP failures from the first child generation are
  // visible in the tray/notification path as well as in the Settings tab.
  runtime.onMcpStatus(reportMcpStatus);

  // Register ready/stuck listeners BEFORE runtime.start(). If the supervisor
  // spawn fails synchronously (e.g. missing binary), the stuck listeners
  // fire inside runtime.start() — they must already be attached.
  runtime.supervisor.onReady((h) => {
    appLogger?.logger.info({ url: h.url, pid: h.pid, restarts: h.restarts }, 'harness ready');
    closeSplash();
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow(h.url);
    } else if (harnessView && !harnessView.webContents.isDestroyed()) {
      // DSH chooses a new ephemeral loopback port on restart. Move the
      // existing trusted view to that generation before accepting its IPC.
      void harnessView.webContents.loadURL(h.url).catch((error: unknown) => {
        appLogger?.logger.error({ error }, 'failed to reload restarted harness view');
      });
    }
    if (process.platform !== 'darwin') {
      try {
        new Notification({ title: t('notify.ready.title'), body: t('notify.ready.body') }).show();
      } catch {
        /* fallback silent */
      }
    }
  });

  runtime.supervisor.onStuck((inst) => {
    closeSplash();
    const logPath = join(userDataDir, 'logs', 'app.log');
    appLogger?.logger.error({ restarts: inst.restarts, tail: inst.lastOutputTail }, 'harness supervisor gave up');
    const tailPreview = inst.lastOutputTail && inst.lastOutputTail.trim().length > 0
      ? '\n\n' + inst.lastOutputTail.trim().split(/\r?\n/).slice(-12).join('\n').slice(-800)
      : '';
    void dialog.showMessageBox({
      type: 'error',
      title: t('stuck.title'),
      message: t('stuck.message', inst.restarts),
      detail: t('stuck.detail', logPath) + tailPreview,
      buttons: [t('stuck.retry'), t('stuck.close')],
      defaultId: 0,
      cancelId: 1,
    }).then((choice) => {
      if (choice.response === 0) void runtime?.supervisor.restart();
    });
  });

  appLogger?.logger.info({}, '[DEBUG-STARTUP] 9/10 before runtime.start()');
  await runtime.start();
  appLogger?.logger.info({}, '[DEBUG-STARTUP] 10/10 runtime.start() OK — harness should be starting');

  reportBackendState('pool', 'ready', 'Phoenix FreeLLMpool gateway active');

  // FASE 6: model refresh at boot + every 30 min.
  let catalog: ModelCatalog | null = null;
  let refreshRetryAttempt = 0;
  let degradedProbeRetries = 0;
  const PHOENIX_REFRESH_RETRY_MS = 30_000;
  const scheduleRefreshRetry = (): void => {
    if (refreshRetryTimer) return;
    const delay = REFRESH_RETRY_DELAYS_MS[Math.min(refreshRetryAttempt, REFRESH_RETRY_DELAYS_MS.length - 1)]!;
    refreshRetryAttempt++;
    refreshRetryTimer = setTimeout(() => {
      refreshRetryTimer = null;
      void doRefresh();
    }, delay);
    refreshRetryTimer.unref();
  };
  const doRefresh = createSingleFlight(async (): Promise<ModelCatalog | null> => {
    try {
      catalog = await catalogRefreshState.run(() => refreshModels({
        lbBaseUrl: phoenixUrl,
        homeDir: join(userDataDir, 'dsh-home'),
        userDataDir,
        authHeader: `Bearer ${phoenixApiKey}`,
        provider: 'freecode-phoenix',
        exactModelIds: phoenixModelIds,
        probeModels: true,
        apiKeyEnv: 'FREECODE_PHOENIX_API_KEY',
        providers: [],
        onUpdate: (c) => {
          catalog = c;
          reportNoFreeModels(c);
          const temporarilyHiddenRoutes = Object.values(c.providers)
            .flatMap((provider) => provider.models)
            .filter((model) => model.lastKnownGood === true).length;
          const verifiedRoutes = Object.values(c.providers)
            .flatMap((provider) => provider.models)
            .filter((model) => model.responds).length;
          const retrying = shouldRetryModelRefresh(c);
          const retrySuffix = retrying ? ' Bounded refresh retries are scheduled.' : ' The next check follows the regular refresh cadence.';
          const degradedMessage = temporarilyHiddenRoutes > 0
            ? `Some model probes failed before a response; ${temporarilyHiddenRoutes} previously verified route(s) are hidden until a valid completion succeeds.${retrySuffix}`
            : verifiedRoutes > 0
              ? `Some model probes failed; ${verifiedRoutes} currently verified route(s) remain selectable.${retrySuffix}`
              : `No Phoenix model is available right now. The local allowlisted catalog will retry automatically.${retrySuffix}`;
          reportBackendState('catalog', c.availability === 'degraded' ? 'degraded' : 'ready',
            c.availability === 'degraded' ? degradedMessage : undefined);
        },
      }));
      refreshRetryAttempt = 0;
      // Retry transient per-model failures even when another route responds,
      // so temporarily hidden routes can reappear after a valid completion
      // without waiting for the regular cadence. Permanent HTTP 4xx
      // protocol/auth failures only use that regular cadence. Bounded: 8
      // short retries per degraded period, then cadence.
      if (phoenixUrl) {
        const shouldRetry = catalog ? shouldRetryModelRefresh(catalog) : true;
        if (!shouldRetry) degradedProbeRetries = 0;
        if (shouldRetry && degradedProbeRetries++ < 8 && !shuttingDown) {
          refreshRetryTimer = setTimeout(() => { refreshRetryTimer = null; void doRefresh(); }, PHOENIX_REFRESH_RETRY_MS);
          refreshRetryTimer.unref();
        }
      }
      return catalog;
    } catch (err) {
      reportModelRefreshFailure(err);
      console.error('[main] model refresh failed:', err);
      scheduleRefreshRetry();
      return null;
    }
  });
  void doRefresh();
  refreshIntervalId = setInterval(() => void doRefresh(), REFRESH_INTERVAL_MS);
  refreshIntervalId.unref();

  // FASE 10: IPC contract.
  registerIpc({
    runtime,
    userDataDir,
    homeDir: join(userDataDir, 'dsh-home'),
    lbBaseUrl: phoenixUrl,
    catalogStore: { get: () => catalog },
    catalogRefreshState,
    reportModelRefreshFailure,
    triggerRefresh: async () => {
      const refreshedCatalog = await doRefresh();
      if (!refreshedCatalog) throw new Error('Model catalog refresh did not produce a catalog');
      return refreshedCatalog;
    },
    isTrustedRendererInvocation: (event, channel) => isTrustedRendererCall(event, {
      harnessWebContents: harnessView?.webContents ?? null,
      harnessUrl: runtime?.supervisor.currentUrl ?? '',
    }, channel),
    setLocale: applyNativeLocale,
    // The harness page renders in a nested WebContentsView, so
    // mainWindow.webContents (the default target) is blank. Route pushes
    // to harnessView.webContents instead so IPC.send actually reaches the
    // renderer preload.
    getRendererTargets: () => harnessView && !harnessView.webContents.isDestroyed()
      ? [harnessView.webContents]
      : [],
  });

  if (runtime.supervisor.statusValue === 'ready' && runtime.supervisor.currentUrl) {
    closeSplash();
    if (!mainWindow) createMainWindow(runtime.supervisor.currentUrl);
  }

  buildMenu();
  createTray();

  // Watchdog: if the splash is still visible after 120s, the supervisor
  // never reached 'ready' or 'stuck'. Close the splash and surface a
  // diagnostic error so the user is not left staring at a spinner forever.
  const splashWatchdog = setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed() && !mainWindow) {
      appLogger?.logger.error({
        supervisorStatus: runtime?.supervisor.statusValue,
        supervisorUrl: runtime?.supervisor.currentUrl,
        poolWorkers: runtime?.workers().length ?? 0,
      }, 'startup watchdog fired — splash still visible after 120s');
      closeSplash();
      const logPath = join(userDataDir, 'logs', 'app.log');
      void dialog.showMessageBox({
        type: 'error',
        title: t('stuck.title'),
        message: t('stuck.timeout.message'),
        detail: t('stuck.timeout.detail', runtime?.supervisor.statusValue ?? t('version.unknown'), logPath),
        buttons: [t('stuck.close')],
      });
    }
  }, 120_000);
  splashWatchdog.unref();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && runtime?.supervisor.currentUrl) {
      createMainWindow(runtime.supervisor.currentUrl);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running for the tray; the harness pool stays up.
  }
});

app.on('before-quit', async (e) => {
  if (shuttingDown) return; // re-entrancy guard: Electron may fire before-quit multiple times
  shuttingDown = true;
  e.preventDefault();

  // Collect PIDs of managed processes for staged shutdown
  const pids: number[] = [];
  if (runtime?.supervisor.currentPid) pids.push(runtime.supervisor.currentPid);

  try {
    await lifecycleMgr?.gracefulShutdown(pids, async () => {
      // Clear all timers to prevent post-shutdown callbacks
      if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
      if (refreshRetryTimer) { clearTimeout(refreshRetryTimer); refreshRetryTimer = null; }
      if (refreshIntervalId) { clearInterval(refreshIntervalId); refreshIntervalId = null; }
      await embeddedBrowser?.close();
      embeddedBrowser = null;
      await dialogBridge?.close();
      dialogBridge = null;
      await runtime?.stop();
      await appLogger?.close();
    });
  } catch (err) {
    console.error('[main] before-quit cleanup error:', err);
  }
  lifecycleMgr?.destroy();
  app.exit(0);
});
