import { app, BrowserWindow, Menu, Tray, WebContentsView, nativeImage, Notification, dialog } from 'electron';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createShellRuntime, ShellRuntime } from './runtime.js';
import { DEFAULT_POOL_SIZE } from '@freecode/opencode-adapter';
import { createSecretStore, ensureSecret } from './secret-store.js';
import { seedProviders } from './provider-seeder.js';
import { refreshModels, ModelCatalog } from './model-refresher.js';
import { registerIpc } from './ipc.js';
import { nodeRuntimeEnv, resolveNodePath, resolveResourcesDir } from './resource-paths.js';
import { createAppLogger, type AppLogger } from './logger.js';
import { createUpdateService, isNewerVersion, type UpdateCheckResult, type UpdateService } from './updater.js';
import { createHarnessUpdater } from './harness-updater.js';
import { createEmbeddedBrowser, type EmbeddedBrowser } from './embedded-browser.js';
import { createDialogBridge, type DialogBridge } from './dialog-bridge.js';
import { awaitHarnessLayout, formatPreflightFailure } from './preflight.js';
import { initLocale, setLocale as setNativeLocale, t } from './i18n.js';
import { shouldNotifyBackendState, type BackendState } from './backend-state.js';
import {
  TorFleet,
  loadTorFleetState,
  saveTorFleetState,
  resolveTorBinaryPath,
  resolveTorGeoipDir,
} from './torfleet.js';

/**
 * Electron main — wires the runtime (pool -> LB -> harness), the native
 * window wrapping the harness webview, tray, and the pool overlay.
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

async function bootstrap(): Promise<ShellRuntime> {
  const userDataDir = app.getPath('userData');
  const resources = resourcesDir();
  const secrets = await createSecretStore(userDataDir);
  // OpenCode's public route is the zero-config OpenCode Free pool. Keep it in
  // the vault so llm-pi-ai reports the seeded provider as configured, while
  // never overwriting a user's private OpenCode key.
  if (!process.env.FREECODE_PUBLIC_KEY) {
    await ensureSecret(secrets, 'FREECODE_PUBLIC_KEY', 'public');
  }
  const runtime = await createShellRuntime({
    resourcesDir: resources,
    nodePath: findNode(),
    userDataDir,
    poolSize: DEFAULT_POOL_SIZE,
    lbAuthHeader: 'Bearer public',
    secrets,
    secretEnvNames: ['FREECODE_PUBLIC_KEY'],
    nodeEnv: nodeRuntimeEnv(app.isPackaged),
    extraEnv: {
      DSH_CLIENT_TITLE: 'FreeCode',
      ...(dialogBridge ? {
        FREECODE_DIALOG_BRIDGE_ENDPOINT: dialogBridge.endpoint,
        FREECODE_DIALOG_BRIDGE_TOKEN: dialogBridge.token,
      } : {}),
    },
    browserBridge: embeddedBrowser ? { endpoint: embeddedBrowser.endpoint, token: embeddedBrowser.token } : undefined,
    log: (level, msg, meta) => {
      const fn = level === 'error' || level === 'warn' ? level : 'info';
      appLogger?.logger[fn]?.(meta ?? {}, msg);
    },
  });
  return runtime;
}

let splashWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let harnessView: WebContentsView | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let runtime: ShellRuntime | null = null;
let appLogger: AppLogger | null = null;
let updateService: UpdateService | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let overlayOpen = false;
let localUpdateRunning = false;
let torfleet: TorFleet | null = null;
let embeddedBrowser: EmbeddedBrowser | null = null;
let dialogBridge: DialogBridge | null = null;
let updateIndicatorView: WebContentsView | null = null;
let latestUpdateResult: UpdateCheckResult | null = null;
let updateCheckInFlight: Promise<UpdateCheckResult | null> | null = null;
let updateIndicatorPlacement = 0;
const UPDATE_INDICATOR_SIZE = 32;
let torfleetEnabled = false;
let shuttingDown = false;
const backendStates: Record<'catalog' | 'pool', BackendState> = { catalog: 'unknown', pool: 'unknown' };

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
<p>${t('splash.loading')}</p>
<div class="spinner"></div>
</body></html>`;
  splashWindow.loadURL('data:text/html,' + encodeURIComponent(html));
  splashWindow.on('closed', () => { splashWindow = null; });
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
  // The harness renders in a WebContentsView child of contentView so its
  // bounds can be resized independently. Loading the harness into
  // mainWindow.webContents (classic BrowserWindow.loadURL) would fill the
  // entire content area with no way to shrink it — the embedded browser
  // panel would then draw ON TOP of the harness, covering conversation
  // text (F1 postmortem: v0.2.2 "reflow" fix silently no-op'd because
  // BrowserWindow.webContents does not appear in contentView.children).
  harnessView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: resolve(import.meta.dirname, '../preload/index.js'),
    },
  });
  mainWindow.contentView.addChildView(harnessView);
  const size = mainWindow.getContentSize();
  harnessView.setBounds({ x: 0, y: 0, width: size[0] ?? 1280, height: size[1] ?? 820 });
  void harnessView.webContents.loadURL(harnessUrl);
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
  mainWindow.on('resize', () => {
    if (!mainWindow || mainWindow.isDestroyed() || !harnessView) return;
    // embedded-browser reacts to the same resize event separately; only
    // touch bounds here when the browser is not managing them.
    if (!embeddedBrowserVisible()) {
      const s = mainWindow.getContentSize();
      harnessView.setBounds({ x: 0, y: 0, width: s[0] ?? 1280, height: s[1] ?? 820 });
    }
  });
  harnessView.webContents.on('did-finish-load', updateUpdateIndicatorBounds);
  mainWindow.on('closed', () => {
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

function renderUpdateIndicatorHtml(): string {
  const label = t('update.indicator');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}
a{width:32px;height:32px;display:flex;align-items:center;justify-content:center;text-decoration:none;
  color:#c9ced8;background:#262a33;border:1px solid #3c424e;border-radius:50%;
  font:600 20px/1 system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 2px 8px #0005}
a:hover{color:#fff;background:#343a46;border-color:#6b7484}a:active{transform:translateY(1px)}
</style></head><body><a href="freecode://updates/open" aria-label="${label}" title="${label}">&#8595;</a></body></html>`;
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
  const fallback = { x: 230, y: Math.max(0, height - 37), width: UPDATE_INDICATOR_SIZE, height: UPDATE_INDICATOR_SIZE };
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
      : Math.round(harnessBounds.x + anchor.right - (UPDATE_INDICATOR_SIZE + 6));
    const y = Math.round(harnessBounds.y + anchor.top + (anchor.height - UPDATE_INDICATOR_SIZE) / 2);
    updateIndicatorView.setBounds({ x: Math.max(0, x), y: Math.max(0, y), width: UPDATE_INDICATOR_SIZE, height: UPDATE_INDICATOR_SIZE });
  }).catch(() => undefined);
}

function refreshUpdateIndicator(): void {
  if (!updateIndicatorView || updateIndicatorView.webContents.isDestroyed()) return;
  void updateIndicatorView.webContents
    .loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(renderUpdateIndicatorHtml()))
    .catch(() => undefined);
  updateUpdateIndicatorBounds();
}

function ensureUpdateIndicator(): void {
  if (!mainWindow || mainWindow.isDestroyed() || updateIndicatorView) return;
  updateIndicatorView = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
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

function createOverlayWindow(): void {
  // Overlay shows pool state; loaded from built renderer assets when present,
  // otherwise a minimal inline status page is served from the runtime.
  overlayWindow = new BrowserWindow({
    width: 480,
    height: 640,
    frame: false,
    transparent: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: resolve(import.meta.dirname, '../preload/index.js'),
    },
  });
  overlayWindow.loadURL('data:text/html,' + encodeURIComponent(renderOverlayHtml()));
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayOpen = false;
  });
}

function renderOverlayHtml(): string {
  const workers = runtime?.workers() ?? [];
  const poolSize = runtime?.pool.size() ?? DEFAULT_POOL_SIZE;
  const rows = workers
    .map(
      (w) =>
        `<tr><td>${w.id}</td><td>${w.status}</td><td>127.0.0.1:${w.port}</td><td>${w.pid}</td><td>${w.restarts}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${t('overlay.title')}</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui;background:#0f1117;color:#d7dae2;padding:16px;margin:0;-webkit-app-region:drag;user-select:none}
table,input,button,label{-webkit-app-region:no-drag}
table{width:100%;border-collapse:collapse}
td,th{border:1px solid #2a2f3a;padding:6px 8px;font-size:12px;text-align:left}
th{background:#1a1e27}
button{background:#ff7a00;border:0;color:#000;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:600}
.close-btn{position:fixed;top:8px;right:8px;background:transparent;color:#9da4b3;font-size:18px;padding:4px 10px;border-radius:4px;-webkit-app-region:no-drag}
.close-btn:hover{background:#2a2f3a;color:#fff}
input[type=range]{width:100%;margin:8px 0}
</style></head>
<body>
<button class="close-btn" onclick="window.close()" title="Close">✕</button>
<h3 style="margin-top:0">${t('overlay.title')}</h3>
<label for="pool-size">${t('overlay.workersLabel')} <output id="pool-size-value">${poolSize}</output></label>
<input id="pool-size" type="range" min="1" max="16" step="1" value="${poolSize}" oninput="document.getElementById('pool-size-value').value=this.value" onchange="window.freecode.pool.resize(Number(this.value))">
<p style="font-size:12px;color:#9da4b3">${t('overlay.workersNote')}</p>
<table><thead><tr><th>id</th><th>status</th><th>addr</th><th>pid</th><th>restarts</th></tr></thead><tbody id="pool-rows">${rows}</tbody></table>
<hr style="border-color:#2a2f3a;margin:16px 0">
<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
  <label style="font-weight:600;font-size:14px">TorFleet</label>
  <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;-webkit-app-region:no-drag">
    <input id="tor-toggle" type="checkbox" ${torfleetEnabled ? 'checked' : ''} style="opacity:0;width:0;height:0" onchange="window.freecode.torfleet.enable(this.checked)">
    <span style="position:absolute;inset:0;background:${torfleetEnabled ? '#ff7a00' : '#2a2f3a'};border-radius:12px;transition:.3s"></span>
    <span style="position:absolute;top:2px;left:${torfleetEnabled ? '22px' : '2px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:.3s"></span>
  </label>
  <span id="tor-status-label" style="font-size:12px;color:#9da4b3">${torfleetEnabled ? 'ON' : 'OFF'}</span>
</div>
<table id="tor-table" style="display:${torfleetEnabled ? 'table' : 'none'}"><thead><tr><th>tor</th><th>status</th><th>SOCKS5</th><th>pid</th></tr></thead><tbody id="tor-rows"></tbody></table>
<script>
window.freecode.pool.onStatus(function(payload) {
  var tbody = document.getElementById('pool-rows');
  tbody.innerHTML = payload.workers.map(function(w) {
    return '<tr><td>'+w.id+'</td><td>'+w.status+'</td><td>127.0.0.1:'+w.port+'</td><td>'+w.pid+'</td><td>'+w.restarts+'</td></tr>';
  }).join('');
  var slider = document.getElementById('pool-size');
  var output = document.getElementById('pool-size-value');
  if (payload.workers.length !== Number(slider.value)) {
    slider.value = payload.workers.length;
    output.value = payload.workers.length;
  }
});
window.freecode.torfleet.onStatus(function(payload) {
  var toggle = document.getElementById('tor-toggle');
  var label = document.getElementById('tor-status-label');
  var table = document.getElementById('tor-table');
  var track = toggle.nextElementSibling;
  var knob = track.nextElementSibling;
  toggle.checked = payload.enabled;
  label.textContent = payload.enabled ? 'ON' : 'OFF';
  track.style.background = payload.enabled ? '#ff7a00' : '#2a2f3a';
  knob.style.left = payload.enabled ? '22px' : '2px';
  table.style.display = payload.enabled ? 'table' : 'none';
  if (payload.instances) {
    var tbody = document.getElementById('tor-rows');
    tbody.innerHTML = payload.instances.map(function(i) {
      return '<tr><td>tor-'+i.index+'</td><td>'+i.status+'</td><td>127.0.0.1:'+i.socksPort+'</td><td>'+i.pid+'</td></tr>';
    }).join('');
  }
});
</script>
</body></html>`;
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
  const result = spawnSync('git', ['log', '--all', '--format=%b', '--grep=git-subtree-dir: vendor/deepseek-harness'], {
    cwd: projectRoot(),
    encoding: 'utf8',
    windowsHide: true,
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
      const install = await service.installHarness(result.harness!);
      if (install.status === 'installed') {
        await dialog.showMessageBox({ type: 'info', title: t('update.harnessComplete.title'), message: t('update.harnessComplete.message') });
      } else {
        await dialog.showMessageBox({ type: 'error', title: t('update.failed.title'), message: install.error ?? t('update.failed.message') });
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
      const install = await service.downloadAndInstall();
      if (install.status === 'failed') {
        await dialog.showMessageBox({ type: 'error', title: t('update.failed.title'), message: install.error ?? t('update.failed.message') });
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
  const child = spawn(node, [script], {
    cwd: projectRoot(),
    env: { ...process.env, CI: process.env.CI ?? 'true' },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.once('error', (error) => {
    localUpdateRunning = false;
    appLogger?.logger.error({ err: error }, 'local upstream update failed to start');
    void dialog.showMessageBox({ type: 'error', title: t('update.localFailed.title'), message: error.message });
  });
  child.once('close', (code) => {
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
      label: t('menu.pool'),
      submenu: [
        { label: t('menu.poolStatus'), click: () => openOverlay() },
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
        { label: t('menu.about'), click: () => void import('electron').then(({ dialog }) => dialog.showMessageBox({ message: t('menu.aboutMessage') })) },
      ],
    },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }
  overlayOpen = true;
  createOverlayWindow();
}

function updateTrayMenu(): void {
  tray?.setToolTip(t('tray.tooltip'));
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.show'), click: () => showMainWindowFromTray() },
      { label: t('menu.poolStatus'), click: () => openOverlay() },
      {
        label: t('menu.restartHarness'),
        click: () => void runtime?.supervisor.restart(),
      },
      { type: 'separator' },
      { label: t('menu.quit'), click: () => app.quit() },
    ]),
  );
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
  initLocale(app.getLocale());
  createSplashWindow();
  const userDataDir = app.getPath('userData');
  if (app.isPackaged && !isPortable()) writeInstallMarker(userDataDir);
  checkStalePortable();
  appLogger = createAppLogger(join(userDataDir, 'logs'));
  appLogger.logger.info({ packaged: app.isPackaged, platform: process.platform }, 'shell starting');
  const resources = resourcesDir();
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
    resourcesDir: resources,
    currentVersion: bundledHarnessVersion(resources),
  });
  updateService = createUpdateService({
    enabled: true,
    checkReleases: app.isPackaged,
    upstreamCommit: bundledUpstreamCommit(resources),
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
  void checkForUpdates();
  updateTimer = setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1_000);
  updateTimer.unref();
  try {
    embeddedBrowser = await createEmbeddedBrowser(userDataDir, () => mainWindow);
  } catch (error) {
    appLogger?.logger.warn({ err: error }, 'embedded browser unavailable; computer_use will report capability absence');
  }
  if (process.platform === 'win32') {
    try {
      dialogBridge = await createDialogBridge();
    } catch (error) {
      appLogger?.logger.warn({ err: error }, 'dialog bridge unavailable; directory picker falls back to koffi worker');
    }
  }
  runtime = await bootstrap();
  await runtime.start();

  const lbUrl = runtime.lb.url();
  const reportPoolState = (): void => {
    const readyWorkers = runtime?.workers().filter((worker) => worker.status === 'ready').length ?? 0;
    reportBackendState('pool', readyWorkers > 0 ? 'ready' : 'down', `${readyWorkers} worker(s) ready`);
  };
  runtime.pool.onWorkerChange(reportPoolState);
  reportPoolState();
  // FASE 5: seed once the LB is up.
  seedProviders({ homeDir: join(userDataDir, 'dsh-home'), lbBaseUrl: `${lbUrl}/v1` });

  // FASE 6: model refresh at boot + every 30 min.
  let catalog: ModelCatalog | null = null;
  let refreshInFlight = false;
  let refreshRetryAttempt = 0;
  let refreshRetryTimer: NodeJS.Timeout | null = null;
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
  const doRefresh = async (): Promise<void> => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      catalog = await refreshModels({
        lbBaseUrl: lbUrl,
        homeDir: join(userDataDir, 'dsh-home'),
        userDataDir,
        authHeader: 'Bearer public',
        onUpdate: (c) => {
          catalog = c;
          reportBackendState('catalog', c.availability === 'degraded' ? 'degraded' : 'ready',
            c.availability === 'degraded' ? 'No model probe responded; keeping the last known-good selection.' : undefined);
        },
      });
      refreshRetryAttempt = 0;
    } catch (err) {
      reportModelRefreshFailure(err);
      console.error('[main] model refresh failed:', err);
      scheduleRefreshRetry();
    } finally {
      refreshInFlight = false;
    }
  };
  void doRefresh();
  setInterval(() => void doRefresh(), REFRESH_INTERVAL_MS);

  // TorFleet — headless Tor SOCKS5 rotation for pool 429 mitigation.
  const tfState = loadTorFleetState(userDataDir);
  torfleetEnabled = tfState.enabled;

  const enableTorfleet = async (on: boolean): Promise<void> => {
    torfleetEnabled = on;
    saveTorFleetState(userDataDir, { enabled: on });
    if (on) {
      if (!torfleet) {
        torfleet = new TorFleet({
          torBinaryPath: resolveTorBinaryPath(resources),
          dataDir: join(userDataDir, 'torfleet'),
          geoipDir: resolveTorGeoipDir(resources),
        });
      }
      await torfleet.start();
      const proxies = torfleet.socksProxies();
      if (proxies.length > 0 && runtime) {
        await runtime.pool.setSocks5({
          socks5_proxies: proxies,
          active_socks5: '__round_robin__',
          socks5_paid_direct: false,
        });
      }
      torfleet.onChange(async (instances) => {
        const ready = instances.filter((i) => i.status === 'ready');
        if (runtime && ready.length > 0) {
          const fresh = torfleet!.socksProxies();
          await runtime.pool.setSocks5({
            socks5_proxies: fresh,
            active_socks5: '__round_robin__',
            socks5_paid_direct: false,
          });
        }
      });
    } else {
      if (torfleet) {
        await torfleet.stop();
        torfleet = null;
      }
      if (runtime) {
        await runtime.pool.setSocks5(null);
      }
    }
  };

  if (torfleetEnabled) {
    void enableTorfleet(true);
  }

  // FASE 10: IPC contract.
  registerIpc({
    runtime,
    userDataDir,
    homeDir: join(userDataDir, 'dsh-home'),
    lbBaseUrl: lbUrl,
    catalogStore: { get: () => catalog },
    torfleet: {
      get instance() { return torfleet; },
      enable: enableTorfleet,
      isEnabled: () => torfleetEnabled,
    },
    reportModelRefreshFailure,
    setLocale: applyNativeLocale,
    // The harness page renders in a nested WebContentsView, so
    // mainWindow.webContents (the default target) is blank. Route pushes
    // to harnessView.webContents instead so IPC.send actually reaches the
    // renderer preload.
    getRendererTargets: () => harnessView && !harnessView.webContents.isDestroyed()
      ? [harnessView.webContents]
      : [],
  });

  // Wait for harness readiness, then open the window on its URL.
  runtime.supervisor.onReady((h) => {
    closeSplash();
    if (!mainWindow) createMainWindow(h.url);
    if (process.platform !== 'darwin') {
      try {
        new Notification({ title: t('notify.ready.title'), body: h.url }).show();
      } catch {
        /* fallback silent */
      }
    }
  });

  runtime.supervisor.onStuck((inst) => {
    const logPath = join(userDataDir, 'logs', 'app.log');
    appLogger?.logger.error({ restarts: inst.restarts, tail: inst.lastOutputTail }, 'harness supervisor gave up');
    // The tail is the last stderr/stdout captured before the process died;
    // for boot-time crashes it usually names the missing file or the koffi
    // abort that caused SIGABRT. Surface at most the last 800 chars so the
    // dialog stays readable.
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

  if (runtime.supervisor.statusValue === 'ready' && runtime.supervisor.currentUrl) {
    closeSplash();
    if (!mainWindow) createMainWindow(runtime.supervisor.currentUrl);
  }

  buildMenu();
  createTray();

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
  shuttingDown = true;
  if (!runtime) {
    if (torfleet) await torfleet.stop();
    await appLogger?.close();
    return;
  }
  e.preventDefault();
  if (updateTimer) clearInterval(updateTimer);
  if (torfleet) await torfleet.stop();
  await embeddedBrowser?.close();
  embeddedBrowser = null;
  await dialogBridge?.close();
  dialogBridge = null;
  await runtime.stop();
  await appLogger?.close();
  app.exit(0);
});
