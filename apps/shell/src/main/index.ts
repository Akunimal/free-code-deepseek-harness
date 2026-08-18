import { app, BrowserWindow, Menu, Tray, nativeImage, Notification } from 'electron';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createShellRuntime, ShellRuntime } from './runtime.js';
import { createSecretStore } from './secret-store.js';
import { seedProviders } from './provider-seeder.js';
import { refreshModels, ModelCatalog } from './model-refresher.js';
import { registerIpc } from './ipc.js';
import { nodeRuntimeEnv, resolveNodePath, resolveResourcesDir } from './resource-paths.js';
import { createAppLogger, type AppLogger } from './logger.js';
import { createUpdateService, type UpdateService } from './updater.js';

/**
 * Electron main — wires the runtime (pool -> LB -> harness), the native
 * window wrapping the harness webview, tray, and the pool overlay.
 */

const isDev = !app.isPackaged;

// ---- resource paths ----
function resourcesDir(): string {
  return resolveResourcesDir({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
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
  const runtime = await createShellRuntime({
    resourcesDir: resources,
    nodePath: findNode(),
    userDataDir,
    poolSize: 4,
    lbAuthHeader: 'Bearer public',
    secrets,
    secretEnvNames: ['FREECODE_PUBLIC_KEY'],
    nodeEnv: nodeRuntimeEnv(app.isPackaged),
  });
  return runtime;
}

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let runtime: ShellRuntime | null = null;
let appLogger: AppLogger | null = null;
let updateService: UpdateService | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let overlayOpen = false;

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
  const rows = workers
    .map(
      (w) =>
        `<tr><td>${w.id}</td><td>${w.status}</td><td>127.0.0.1:${w.port}</td><td>${w.pid}</td><td>${w.restarts}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pool status</title>
<style>body{font-family:system-ui;background:#0f1117;color:#d7dae2;padding:16px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #2a2f3a;padding:6px 8px;font-size:12px;text-align:left}th{background:#1a1e27}button{background:#ff7a00;border:0;color:#000;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:600}</style></head>
<body><h3>Pool status</h3>
<button onclick="location.reload()">Refresh</button>
<table><tr><th>id</th><th>status</th><th>addr</th><th>pid</th><th>restarts</th></tr>${rows}</table></body></html>`;
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [];
  if (process.platform === 'darwin') {
    template.push({ role: 'appMenu' });
  }
  template.push(
    { role: 'fileMenu', label: 'Archivo' },
    {
      label: 'Pool',
      submenu: [
        { label: 'Pool status…', click: () => openOverlay() },
        {
          label: 'Restart harness',
          click: () => void runtime?.supervisor.restart(),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    { role: 'viewMenu', label: 'Ver' },
    { role: 'windowMenu', label: 'Ventana' },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Buscar actualizaciones',
          click: () => void updateService?.check(),
        },
        { label: 'Acerca de', click: () => void import('electron').then(({ dialog }) => dialog.showMessageBox({ message: 'FreeCode DeepSeek Harness' })) },
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
      { label: 'Mostrar', click: () => mainWindow?.show() },
      { label: 'Pool status', click: () => openOverlay() },
      {
        label: 'Restart harness',
        click: () => void runtime?.supervisor.restart(),
      },
      { type: 'separator' },
      { label: 'Salir', click: () => app.quit() },
    ]),
  );
  tray.on('click', () => mainWindow?.show());
}

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

app.whenReady().then(async () => {
  const userDataDir = app.getPath('userData');
  appLogger = createAppLogger(join(userDataDir, 'logs'));
  appLogger.logger.info({ packaged: app.isPackaged, platform: process.platform }, 'shell starting');
  updateService = createUpdateService({
    enabled: process.env.FREECODE_ENABLE_UPDATES === '1',
    log: (message, details) => appLogger?.logger.info({ details }, message),
  });
  if (updateService.enabled) {
    void updateService.check();
    updateTimer = setInterval(() => void updateService?.check(), 6 * 60 * 60 * 1_000);
    updateTimer.unref();
  }
  runtime = await bootstrap();
  await runtime.start();
  await runtime.lb.listen();

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
    if (!mainWindow) createMainWindow(h.url);
    if (process.platform !== 'darwin') {
      // Native notifications via wrapper (FASE 9.5): HTML5 notif by default.
      try {
        new Notification({ title: 'Harness listo', body: h.url }).show();
      } catch {
        /* fallback silent */
      }
    }
  });
  // If harness is already ready (fast boot), attach now.
  if (runtime.supervisor.statusValue === 'ready' && runtime.supervisor.currentUrl) {
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
