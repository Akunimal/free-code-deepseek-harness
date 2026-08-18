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
let localUpdateRunning = false;

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
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pool status</title>
<style>body{font-family:system-ui;background:#0f1117;color:#d7dae2;padding:16px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #2a2f3a;padding:6px 8px;font-size:12px;text-align:left}th{background:#1a1e27}button{background:#ff7a00;border:0;color:#000;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:600}</style></head>
<body><h3>Pool status</h3>
<label for="pool-size">Accounts / workers: <output id="pool-size-value">${poolSize}</output></label>
<input id="pool-size" type="range" min="1" max="16" step="1" value="${poolSize}" oninput="document.getElementById('pool-size-value').value=this.value" onchange="window.freecode.pool.resize(Number(this.value)).then(()=>location.reload())">
<p style="font-size:12px;color:#9da4b3">This changes local parallel workers. It does not create extra OpenCode accounts or bypass upstream/IP limits.</p>
<button onclick="location.reload()">Refresh</button>
<table><tr><th>id</th><th>status</th><th>addr</th><th>pid</th><th>restarts</th></tr>${rows}</table></body></html>`;
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
    const version = result.info?.version ?? 'nueva';
    const suffix = upstreamAvailable ? '\\nTambién hay cambios nuevos en el harness original.' : '';
    const choice = await dialog.showMessageBox({
      type: 'info',
      title: 'Actualización disponible',
      message: `FreeCode DeepSeek Harness ${version} está disponible.${suffix}`,
      detail: 'La aplicación descargará la release y se reiniciará para instalarla.',
      buttons: ['Descargar e instalar', 'Ahora no'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) {
      const install = await updateService.downloadAndInstall();
      if (install.status === 'failed') {
        await dialog.showMessageBox({ type: 'error', title: 'No se pudo actualizar', message: install.error ?? 'La descarga falló.' });
      }
    }
    return;
  }

  if (upstreamAvailable && isDev) {
    const choice = await dialog.showMessageBox({
      type: 'info',
      title: 'Harness original actualizado',
      message: 'Hay un commit nuevo de deepseek-ai/deepseek-harness.',
      detail: 'En este checkout local se puede sincronizar la subtree, ejecutar los tests y recompilar el escritorio automáticamente. El árbol debe estar limpio.',
      buttons: ['Actualizar y recompilar', 'Ahora no'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) runLocalUpstreamUpdate();
    return;
  }

  if (upstreamAvailable) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Upstream tiene cambios nuevos',
      message: 'El harness original avanzó, pero todavía no hay una release del fork para instalar.',
      detail: 'Este portable es autocontenido y no trae Git, pnpm ni el toolchain para recompilar. Cuando el fork publique la próxima release, aparecerá aquí para descargarla e instalarla.',
    });
    return;
  }

  const details = result.upstream?.error ? `\n\nNo se pudo consultar upstream: ${result.upstream.error}` : '';
  await dialog.showMessageBox({
    type: result.status === 'failed' ? 'warning' : 'info',
    title: result.status === 'failed' ? 'No se pudo completar la comprobación' : 'Sin actualizaciones',
    message: result.status === 'failed' ? (result.error ?? 'La comprobación de releases falló.') : 'Ya estás usando la versión disponible.',
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
    void dialog.showMessageBox({ type: 'error', title: 'No se pudo actualizar upstream', message: error.message });
  });
  child.once('close', (code) => {
    localUpdateRunning = false;
    if (code === 0) {
      void dialog.showMessageBox({ type: 'info', title: 'Actualización completa', message: 'Upstream se sincronizó y el build de escritorio terminó correctamente. Reiniciá el checkout de desarrollo para probarlo.' });
    } else {
      void dialog.showMessageBox({ type: 'error', title: 'Actualización incompleta', message: `La sincronización o recompilación terminó con código ${code ?? 'desconocido'}. Revisá la terminal del checkout.` });
    }
  });
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
          click: () => void updateFromMenu(),
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
  configurePortableDataDir();
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
