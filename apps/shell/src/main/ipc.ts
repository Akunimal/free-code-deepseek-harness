import { ipcMain, BrowserWindow, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  IpcChannels,
  IpcPayloads,
  ModelCatalogSchema,
  ModelCatalogRefreshStateSchema,
  WorkerHandleSchema,
  GentleAiRunRequestSchema,
  GentleAiStatusSchema,
  type ModelCatalog,
} from '@freecode/shared-types';
import { ShellRuntime } from './runtime.js';
import type { TorManager } from './tor-manager.js';
import { refreshModels } from './model-refresher.js';
import { isOcrAvailable, extractText } from './ocr.js';
import { getGentleAiStatus, runGentleAi, runGentleAiDoctor } from './gentle-ai.js';
import { z } from 'zod';
import { ensureEmbeddedMcpConfig, setEmbeddedMcpEnabled } from './mcp-home.js';
import type { ModelCatalogRefreshStateStore } from './model-refresh-state.js';

const PoolResizePayloadSchema = z.object({ size: z.number().int().min(1).max(16) });
const LocaleSetPayloadSchema = z.object({ locale: z.enum(['zh', 'en', 'es']) });
const PoolRestartWorkerPayloadSchema = z.object({ id: z.string().min(1).max(128) });
const McpSetEnabledPayloadSchema = z.object({ id: z.string().min(1).max(64), enabled: z.boolean() });
const OcrPayloadSchema = z.object({
  imageBase64: z.string().min(1).max(36_000_000),
  lang: z.string().regex(/^[a-z]{3}(?:\+[a-z]{3})*$/u).optional(),
});

/**
 * IPC contract — zod-validated channel handlers exposed to the renderer
 * through the preload bridge (window.freecode).
 */

export interface IpcDeps {
  runtime: ShellRuntime;
  torManager?: TorManager | null;
  userDataDir: string;
  homeDir: string;
  lbBaseUrl: string;
  resourcesDir?: string;
  catalogStore: { get(): unknown };
  catalogRefreshState: ModelCatalogRefreshStateStore;
  reportModelRefreshFailure?: (error: unknown) => void;
  /** Trigger a guarded model refresh (shares the refreshInFlight mutex with the
   *  timer). IPC calls this instead of refreshModels() directly to prevent
   *  concurrent reads and writes to settings.yaml. Returns the catalog. */
  triggerRefresh?: () => Promise<ModelCatalog>;
  setLocale: (locale: 'zh' | 'en' | 'es') => void;
  /** Optional override for renderer broadcast targets. Defaults to every
   *  BrowserWindow's built-in webContents. When the harness runs inside a
   *  nested WebContentsView, the shell provides this so pushes reach the
   *  actual harness page, not the (blank) window container webContents. */
  getRendererTargets?: () => WebContents[];
  /** Close the auxiliary Pool Status window only for its own WebContents. */
  closePoolStatusOverlay: (sender: WebContents) => void;
  /** Validate the invoking main-frame WebContents and its origin per channel. */
  isTrustedRendererInvocation: (event: IpcMainInvokeEvent, channel: string) => boolean;
}

function defaultRendererTargets(): WebContents[] {
  return BrowserWindow.getAllWindows().map((win) => win.webContents);
}

export function registerIpc(deps: IpcDeps): () => void {
  const { runtime, userDataDir, homeDir, lbBaseUrl } = deps;

  const rendererTargets = (): WebContents[] => (deps.getRendererTargets?.() ?? defaultRendererTargets())
    .filter((wc) => !wc.isDestroyed());

  const handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ): void => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!deps.isTrustedRendererInvocation(event, channel)) {
        throw new Error(`Rejected IPC invocation from an untrusted renderer (${channel})`);
      }
      return listener(event, ...args);
    });
  };

  // pool:status (push on change)
  const emitStatus = (): void => {
    const payload: IpcPayloads[typeof IpcChannels.poolStatus] = {
      workers: runtime.workers().map((w) => WorkerHandleSchema.parse(w)),
    };
    for (const wc of rendererTargets()) wc.send(IpcChannels.poolStatus, payload);
  };
  // opencode2api routes requests internally; no per-worker change events
  // emitStatus can be called manually if needed

  // models:refresh (invoke) — route through guarded path when available to
  // prevent concurrent settings.yaml writes with the timer.
  handle(IpcChannels.modelsRefresh, async () => {
    try {
      const catalog = deps.triggerRefresh
        ? await deps.triggerRefresh()
        : await refreshModels({
        lbBaseUrl,
        homeDir,
        userDataDir,
        authHeader: 'Bearer public',
      });
      const parsed = ModelCatalogSchema.parse(catalog);
      for (const wc of rendererTargets()) wc.send(IpcChannels.modelsCatalog, parsed);
      return parsed;
    } catch (error) {
      deps.reportModelRefreshFailure?.(error);
      throw error;
    }
  });

  // The status snapshot covers refreshes that started before the Harness
  // renderer subscribed; the push keeps it current without polling.
  handle(IpcChannels.modelsGetRefreshState, () =>
    ModelCatalogRefreshStateSchema.parse(deps.catalogRefreshState.get()));
  const offCatalogRefreshState = deps.catalogRefreshState.subscribe((state) => {
    const payload: IpcPayloads[typeof IpcChannels.modelsRefreshState] =
      ModelCatalogRefreshStateSchema.parse(state);
    for (const wc of rendererTargets()) wc.send(IpcChannels.modelsRefreshState, payload);
  });


  // harness:restart (invoke)
  handle(IpcChannels.harnessRestart, () => runtime.supervisor.restart());

  // pool:restartWorker (invoke)
  handle(
    IpcChannels.poolRestartWorker,
    (_e, payload: unknown) => {
      const parsed = PoolRestartWorkerPayloadSchema.parse(payload);
      // opencode2api routes internally; individual worker restart is not applicable
      return Promise.resolve();
    },
  );

  // pool:resize — no-op with opencode2api (provider routing is automatic)
  handle(IpcChannels.poolResize, (_e, payload: unknown) => {
    const parsed = PoolResizePayloadSchema.parse(payload);
    return Promise.resolve();
  });

  // pool:closeOverlay — the borderless data: window cannot close itself with
  // window.close(); delegate to main and let it verify the caller's WebContents.
  handle(IpcChannels.poolOverlayClose, (e) => deps.closePoolStatusOverlay(e.sender));

  // settings:openFolder (invoke) — reveal DSH_HOME in the OS file manager
  handle(IpcChannels.settingsOpenFolder, () => shell.openPath(homeDir));

  // mcp:* — product-managed catalog controls. The renderer receives only a
  // projection; paths and patch writes stay in the main process.
  handle(IpcChannels.mcpGetState, () => {
    // Refresh the persisted flags, then merge the live initialize/tools/list
    // evidence maintained by the supervisor. A green toggle alone is not a
    // connection guarantee.
    return deps.runtime.refreshMcpState();
  });
  handle(IpcChannels.mcpSetEnabled, async (_e, payload: unknown) => {
    const parsed = McpSetEnabledPayloadSchema.parse(payload);
    setEmbeddedMcpEnabled(homeDir, parsed.id, parsed.enabled);
    deps.runtime.refreshMcpState();
    // The MCP composition is evaluated when the web child mounts Standard.
    // Restart it so the toggle is effective for new and existing sessions;
    // the shell itself and the persisted catalog remain intact.
    deps.runtime.resetMcpStatus();
    await runtime.supervisor.restart();
    return deps.runtime.mcpState();
  });
  handle(IpcChannels.mcpOpenConfig, async () => {
    const state = ensureEmbeddedMcpConfig(homeDir);
    const failure = await shell.openPath(state.configPath);
    if (failure) throw new Error(failure);
  });

  const offMcpStatus = deps.runtime.onMcpStatus((status) => {
    for (const wc of rendererTargets()) wc.send(IpcChannels.mcpStatus, status);
  });

  // locale:set — keep native Electron menus/tray in step with the web selector.
  handle(IpcChannels.localeSet, (_e, payload: unknown) => {
    const parsed = LocaleSetPayloadSchema.parse(payload);
    deps.setLocale(parsed.locale);
  });

  // ocr:status — check if Tesseract is available
  handle(IpcChannels.ocrStatus, () => ({
    available: isOcrAvailable(),
    binaryPath: null, // not exposed to renderer for security
  }));

  // gentle-ai:status — bounded presence probe (no secrets)
  handle(IpcChannels.gentleAiStatus, () => {
    const resourcesDir = deps.resourcesDir ?? userDataDir;
    const status = getGentleAiStatus(resourcesDir);
    return GentleAiStatusSchema.parse({ ...status, binaryPath: status.binaryPath });
  });

  // gentle-ai:doctor — bounded checks (presence, --version, DSH_HOME, Engram)
  handle(IpcChannels.gentleAiDoctor, async () => {
    const resourcesDir = deps.resourcesDir ?? userDataDir;
    return runGentleAiDoctor(resourcesDir, homeDir);
  });

  // gentle-ai:run — Zod-validated pre-spawn; size/timeout/DSH_HOME guard
  handle(IpcChannels.gentleAiRun, async (_e, payload: unknown) => {
    const parsed = GentleAiRunRequestSchema.parse(payload);
    const resourcesDir = deps.resourcesDir ?? userDataDir;
    return runGentleAi(
      { prompt: parsed.prompt, timeoutMs: parsed.timeoutMs, allowGlobal: parsed.allowGlobal },
      resourcesDir,
      homeDir,
    );
  });

  // ocr:extract — extract text from a bounded base64-encoded image. The
  // canonical round-trip check rejects malformed base64 instead of silently
  // turning it into a different/empty image.
  handle(IpcChannels.ocrExtract, async (_e, payload: unknown) => {
    const parsed = OcrPayloadSchema.parse(payload);
    const buffer = Buffer.from(parsed.imageBase64, 'base64');
    if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) throw new Error('OCR image exceeds the 25MB limit');
    if (buffer.toString('base64').replace(/=+$/u, '') !== parsed.imageBase64.replace(/=+$/u, '')) {
      throw new Error('OCR image payload is not valid base64');
    }
    return extractText(buffer, { lang: parsed.lang });
  });

  // tor:getStatus — snapshot for surfaces opened after the last push
  // (e.g. the pool overlay). Returns null when Tor is not configured.
  handle(IpcChannels.torGetStatus, () => {
    if (!deps.torManager) return null;
    return deps.torManager.getStatus();
  });

  // tor:start / tor:stop — manual Tor daemon control from the overlay.
  // Stopping only removes the failover leg: the gateway keeps serving
  // direct, and its proxy health tracking steers around the dead SOCKS
  // leg until a restart recovers it.
  handle(IpcChannels.torStart, async () => {
    if (!deps.torManager) return false;
    await deps.torManager.start();
    return deps.torManager.isReady;
  });
  handle(IpcChannels.torStop, async () => {
    if (!deps.torManager) return false;
    await deps.torManager.stop();
    return true;
  });

  const emitTorStatus = (): void => {
    if (!deps.torManager) return;
    const status = deps.torManager.getStatus();
    for (const wc of rendererTargets()) wc.send(IpcChannels.torStatus, status);
  };

  let offTorChange: (() => void) | null = null;
  if (deps.torManager) {
    offTorChange = deps.torManager.onChange(() => emitTorStatus());
  }

  return () => {
    offTorChange?.();
    ipcMain.removeHandler(IpcChannels.modelsRefresh);
    ipcMain.removeHandler(IpcChannels.modelsGetRefreshState);
    ipcMain.removeHandler(IpcChannels.harnessRestart);
    ipcMain.removeHandler(IpcChannels.poolRestartWorker);
    ipcMain.removeHandler(IpcChannels.poolResize);
    ipcMain.removeHandler(IpcChannels.poolOverlayClose);
    ipcMain.removeHandler(IpcChannels.settingsOpenFolder);
    ipcMain.removeHandler(IpcChannels.mcpGetState);
    ipcMain.removeHandler(IpcChannels.mcpSetEnabled);
    ipcMain.removeHandler(IpcChannels.mcpOpenConfig);
    ipcMain.removeHandler(IpcChannels.torGetStatus);
    ipcMain.removeHandler(IpcChannels.torStart);
    ipcMain.removeHandler(IpcChannels.torStop);
    ipcMain.removeHandler(IpcChannels.localeSet);
    ipcMain.removeHandler(IpcChannels.ocrExtract);
    ipcMain.removeHandler(IpcChannels.ocrStatus);
    ipcMain.removeHandler(IpcChannels.gentleAiStatus);
    ipcMain.removeHandler(IpcChannels.gentleAiDoctor);
    ipcMain.removeHandler(IpcChannels.gentleAiRun);
    offMcpStatus();
    offCatalogRefreshState();
  };
}
