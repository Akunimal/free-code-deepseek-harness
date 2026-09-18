import { ipcMain, BrowserWindow, shell, type WebContents } from 'electron';
import {
  IpcChannels,
  IpcPayloads,
  ModelCatalogSchema,
  WorkerHandleSchema,
  type ModelCatalog,
} from '@freecode/shared-types';
import { ShellRuntime } from './runtime.js';
import { detectLocalRoutes } from './omniroute-detector.js';
import { refreshModels } from './model-refresher.js';
import { isOcrAvailable, extractText } from './ocr.js';
import { z } from 'zod';
import type { WarpFleet } from './warfleet.js';
import { ensureEmbeddedMcpConfig, setEmbeddedMcpEnabled } from './mcp-home.js';

const PoolResizePayloadSchema = z.object({ size: z.number().int().min(1).max(16) });
const LocaleSetPayloadSchema = z.object({ locale: z.enum(['zh', 'en', 'es']) });
const PoolRestartWorkerPayloadSchema = z.object({ id: z.string().min(1).max(128) });
const WarpFleetEnablePayloadSchema = z.object({ enabled: z.boolean() });
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
  userDataDir: string;
  homeDir: string;
  lbBaseUrl: string;
  catalogStore: { get(): unknown };
  warpFleet: {
    instance: WarpFleet | null;
    enable(on: boolean): Promise<void>;
    isEnabled(): boolean;
  };
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
}

function defaultRendererTargets(): WebContents[] {
  return BrowserWindow.getAllWindows().map((win) => win.webContents);
}

export function registerIpc(deps: IpcDeps): () => void {
  const { runtime, userDataDir, homeDir, lbBaseUrl } = deps;

  const rendererTargets = (): WebContents[] => (deps.getRendererTargets?.() ?? defaultRendererTargets())
    .filter((wc) => !wc.isDestroyed());

  // pool:status (push on change)
  const emitStatus = (): void => {
    const payload: IpcPayloads[typeof IpcChannels.poolStatus] = {
      workers: runtime.workers().map((w) => WorkerHandleSchema.parse(w)),
    };
    for (const wc of rendererTargets()) wc.send(IpcChannels.poolStatus, payload);
  };
  // freellmpool manages routing internally; no per-worker change events
  // emitStatus can be called manually if needed

  // models:refresh (invoke) — route through guarded path when available to
  // prevent concurrent settings.yaml writes with the timer.
  ipcMain.handle(IpcChannels.modelsRefresh, async () => {
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

  // omniroute:detect (invoke)
  ipcMain.handle(IpcChannels.omnirouteDetect, () => detectLocalRoutes());

  // harness:restart (invoke)
  ipcMain.handle(IpcChannels.harnessRestart, () => runtime.supervisor.restart());

  // pool:restartWorker (invoke)
  ipcMain.handle(
    IpcChannels.poolRestartWorker,
    (_e, payload: unknown) => {
      const parsed = PoolRestartWorkerPayloadSchema.parse(payload);
      // freellmpool manages routing internally; individual worker restart is not applicable
      return Promise.resolve();
    },
  );

  // pool:resize — no-op with freellmpool (provider routing is automatic)
  ipcMain.handle(IpcChannels.poolResize, (_e, payload: unknown) => {
    const parsed = PoolResizePayloadSchema.parse(payload);
    return Promise.resolve();
  });

  // settings:openFolder (invoke) — reveal DSH_HOME in the OS file manager
  ipcMain.handle(IpcChannels.settingsOpenFolder, () => shell.openPath(homeDir));

  // mcp:* — product-managed catalog controls. The renderer receives only a
  // projection; paths and patch writes stay in the main process.
  ipcMain.handle(IpcChannels.mcpGetState, () => {
    // Refresh the persisted flags, then merge the live initialize/tools/list
    // evidence maintained by the supervisor. A green toggle alone is not a
    // connection guarantee.
    return deps.runtime.refreshMcpState();
  });
  ipcMain.handle(IpcChannels.mcpSetEnabled, async (_e, payload: unknown) => {
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
  ipcMain.handle(IpcChannels.mcpOpenConfig, async () => {
    const state = ensureEmbeddedMcpConfig(homeDir);
    const failure = await shell.openPath(state.configPath);
    if (failure) throw new Error(failure);
  });

  const offMcpStatus = deps.runtime.onMcpStatus((status) => {
    for (const wc of rendererTargets()) wc.send(IpcChannels.mcpStatus, status);
  });

  // warpfleet:enable (invoke)
  ipcMain.handle(IpcChannels.warpfleetEnable, async (_e, payload: unknown) => {
    const parsed = WarpFleetEnablePayloadSchema.parse(payload);
    await deps.warpFleet.enable(parsed.enabled);
    emitWarpFleetStatus();
  });

  // locale:set — keep native Electron menus/tray in step with the web selector.
  ipcMain.handle(IpcChannels.localeSet, (_e, payload: unknown) => {
    const parsed = LocaleSetPayloadSchema.parse(payload);
    deps.setLocale(parsed.locale);
  });

  // ocr:status — check if Tesseract is available
  ipcMain.handle(IpcChannels.ocrStatus, () => ({
    available: isOcrAvailable(),
    binaryPath: null, // not exposed to renderer for security
  }));

  // ocr:extract — extract text from a bounded base64-encoded image. The
  // canonical round-trip check rejects malformed base64 instead of silently
  // turning it into a different/empty image.
  ipcMain.handle(IpcChannels.ocrExtract, async (_e, payload: unknown) => {
    const parsed = OcrPayloadSchema.parse(payload);
    const buffer = Buffer.from(parsed.imageBase64, 'base64');
    if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) throw new Error('OCR image exceeds the 25MB limit');
    if (buffer.toString('base64').replace(/=+$/u, '') !== parsed.imageBase64.replace(/=+$/u, '')) {
      throw new Error('OCR image payload is not valid base64');
    }
    return extractText(buffer, { lang: parsed.lang });
  });

  const emitWarpFleetStatus = (): void => {
    const wf = deps.warpFleet;
    const payload: IpcPayloads[typeof IpcChannels.warpfleetStatus] = {
      enabled: wf.isEnabled(),
      status: wf.instance?.status() ?? null,
    };
    for (const wc of rendererTargets()) wc.send(IpcChannels.warpfleetStatus, payload);
  };

  let offWarpFleetChange: (() => void) | null = null;
  if (deps.warpFleet.instance) {
    offWarpFleetChange = deps.warpFleet.instance.onChange(() => emitWarpFleetStatus());
  }

  return () => {
    offWarpFleetChange?.();
    ipcMain.removeHandler(IpcChannels.modelsRefresh);
    ipcMain.removeHandler(IpcChannels.omnirouteDetect);
    ipcMain.removeHandler(IpcChannels.harnessRestart);
    ipcMain.removeHandler(IpcChannels.poolRestartWorker);
    ipcMain.removeHandler(IpcChannels.poolResize);
    ipcMain.removeHandler(IpcChannels.settingsOpenFolder);
    ipcMain.removeHandler(IpcChannels.mcpGetState);
    ipcMain.removeHandler(IpcChannels.mcpSetEnabled);
    ipcMain.removeHandler(IpcChannels.mcpOpenConfig);
    ipcMain.removeHandler(IpcChannels.warpfleetEnable);
    ipcMain.removeHandler(IpcChannels.localeSet);
    ipcMain.removeHandler(IpcChannels.ocrExtract);
    ipcMain.removeHandler(IpcChannels.ocrStatus);
    offMcpStatus();
  };
}
