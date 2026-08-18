import { app, BrowserWindow, Menu, Tray, nativeImage, Notification, dialog } from 'electron';
import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createShellRuntime, ShellRuntime } from './runtime.js';
import { createSecretStore, ensureSecret } from './secret-store.js';
import { seedProviders } from './provider-seeder.js';
import { refreshModels, ModelCatalog } from './model-refresher.js';
import { registerIpc } from './ipc.js';
import { nodeRuntimeEnv, resolveNodePath, resolveResourcesDir } from './resource-paths.js';
import { createAppLogger, type AppLogger } from './logger.js';
import { createUpdateService, type UpdateService } from './updater.js';
import { initLocale, t } from './i18n.js';

/**
 * Electron main — wires the runtime (pool -> LB -> harness), the native
 * window wrapping the harness webview, tray, and the pool overlay.
 */

// Packaged Electron has no attached console; Node 22+ throws EPIPE when
// console.log writes to a broken stdout/stderr pipe. Silence it globally.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return;
    throw err;
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
  // OpenCode's public route is the zero-config DeepSeek Free account. Keep it
  // in the vault so llm-pi-ai reports the seeded provider as configured, while
  // never overwriting a user's private OpenCode key.
  if (!process.env.FREECODE_PUBLIC_KEY) {
    await ensureSecret(secrets, 'FREECODE_PUBLIC_KEY', 'public');
  }
  const runtime = await createShellRuntime({
    resourcesDir: resources,
    nodePath: findNode(),
    userDataDir,
    poolSize: 4,
    lbAuthHeader: 'Bearer public',
    secrets,
    secretEnvNames: ['FREECODE_PUBLIC_KEY'],
    nodeEnv: nodeRuntimeEnv(app.isPackaged),
    log: (level, msg, meta) => {
      const fn = level === 'error' || level === 'warn' ? level : 'info';
      appLogger?.logger[fn]?.(meta ?? {}, msg);
    },
  });
  return runtime;
}

let splashWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let runtime: ShellRuntime | null = null;
let appLogger: AppLogger | null = null;
let updateService: UpdateService | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let overlayOpen = false;
let localUpdateRunning = false;

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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: resolve(import.meta.dirname, '../preload/index.js'),
    },
  });
  mainWindow.loadURL(harnessUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
  const poolSize = runtime?.pool.size() ?? 4;
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

function projectRoot(): string {
  // dist/src/main -> repository root. This is used only by the source checkout
  // updater; packaged builds never execute the local rebuild path.
  return resolve(import.meta.dirname, '../../../../');
}

async function updateFromMenu(): Promise<void> {
  if (!updateService) return;
  const result = await updateService.check();
  const releaseAvailable = Boolean(result.info?.version);
  const upstreamAvailable = result.upstream?.available === true;

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
      const install = await updateService.downloadAndInstall();
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

  const details = result.upstream?.error ? `\n\n${t('update.upstreamCheckError', result.upstream.error)}` : '';
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
    { role: 'viewMenu', label: t('menu.view') },
    { role: 'windowMenu', label: t('menu.window') },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.checkUpdates'),
          click: () => void updateFromMenu(),
        },
        { label: t('menu.about'), click: () => void import('electron').then(({ dialog }) => dialog.showMessageBox({ message: 'FreeCode DeepSeek Harness' })) },
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

function createTray(): void {
  const iconPath = join(resourcesDir(), 'tray.png');
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('FreeCode DeepSeek Harness');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.show'), click: () => mainWindow?.show() },
      { label: t('menu.poolStatus'), click: () => openOverlay() },
      {
        label: t('menu.restartHarness'),
        click: () => void runtime?.supervisor.restart(),
      },
      { type: 'separator' },
      { label: t('menu.quit'), click: () => app.quit() },
    ]),
  );
  tray.on('click', () => mainWindow?.show());
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

app.whenReady().then(async () => {
  configurePortableDataDir();
  initLocale(app.getLocale());
  createSplashWindow();
  const userDataDir = app.getPath('userData');
  appLogger = createAppLogger(join(userDataDir, 'logs'));
  appLogger.logger.info({ packaged: app.isPackaged, platform: process.platform }, 'shell starting');
  const resources = resourcesDir();
  updateService = createUpdateService({
    enabled: true,
    checkReleases: app.isPackaged,
    upstreamCommit: bundledUpstreamCommit(resources),
    log: (message, details) => appLogger?.logger.info({ details }, message),
  });
  if (process.env.FREECODE_ENABLE_UPDATES === '1') {
    void updateService.check();
    updateTimer = setInterval(() => void updateService?.check(), 6 * 60 * 60 * 1_000);
    updateTimer.unref();
  }
  runtime = await bootstrap();
  await runtime.start();

  const lbUrl = runtime.lb.url();
  // FASE 5: seed once the LB is up.
  seedProviders({ homeDir: join(userDataDir, 'dsh-home'), lbBaseUrl: `${lbUrl}/v1` });

  // FASE 6: model refresh at boot + every 30 min.
  let catalog: ModelCatalog | null = null;
  const doRefresh = async (): Promise<void> => {
    try {
      catalog = await refreshModels({
        lbBaseUrl: lbUrl,
        homeDir: join(userDataDir, 'dsh-home'),
        userDataDir,
        authHeader: 'Bearer public',
        onUpdate: (c) => (catalog = c),
      });
    } catch (err) {
      console.error('[main] model refresh failed:', err);
    }
  };
  void doRefresh();
  setInterval(() => void doRefresh(), REFRESH_INTERVAL_MS);

  // FASE 10: IPC contract.
  registerIpc({
    runtime,
    userDataDir,
    homeDir: join(userDataDir, 'dsh-home'),
    lbBaseUrl: lbUrl,
    catalogStore: { get: () => catalog },
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
    appLogger?.logger.error({ restarts: inst.restarts }, 'harness supervisor gave up');
    void dialog.showMessageBox({
      type: 'error',
      title: t('stuck.title'),
      message: t('stuck.message', inst.restarts),
      detail: t('stuck.detail', logPath),
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
  if (!runtime) {
    await appLogger?.close();
    return;
  }
  e.preventDefault();
  if (updateTimer) clearInterval(updateTimer);
  await runtime.stop();
  await appLogger?.close();
  app.exit(0);
});
