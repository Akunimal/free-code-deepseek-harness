import { contextBridge, ipcRenderer } from 'electron';
import type {
  FreeCodeApi,
  IpcPayloads,
  ModelCatalog,
  DetectedRoute,
  WorkerHandle,
  WarpFleetStatus,
  OcrResult,
  EmbeddedMcpState,
  McpRuntimeStatus,
} from '@freecode/shared-types';

const IpcChannels = {
  poolStatus: 'pool:status',
  poolRestartWorker: 'pool:restartWorker',
  poolResize: 'pool:resize',
  modelsCatalog: 'models:catalog',
  modelsRefresh: 'models:refresh',
  omnirouteDetect: 'omniroute:detect',
  settingsOpenFolder: 'settings:openFolder',
  mcpGetState: 'mcp:getState',
  mcpSetEnabled: 'mcp:setEnabled',
  mcpOpenConfig: 'mcp:openConfig',
  mcpStatus: 'mcp:status',
  harnessRestart: 'harness:restart',
  warpfleetEnable: 'warpfleet:enable',
  warpfleetStatus: 'warpfleet:status',
  localeSet: 'locale:set',
  ocrExtract: 'ocr:extract',
  ocrStatus: 'ocr:status',
} as const;

/**
 * Preload — the ONLY bridge between the renderer and the main process.
 * contextIsolation: true, nodeIntegration: false, sandbox: true.
 * The renderer never touches ipcRenderer directly.
 */

const api: FreeCodeApi = {
  pool: {
    onStatus(cb: (payload: IpcPayloads[typeof IpcChannels.poolStatus]) => void): () => void {
      const listener = (_e: unknown, payload: IpcPayloads[typeof IpcChannels.poolStatus]): void =>
        cb(payload);
      ipcRenderer.on(IpcChannels.poolStatus, listener);
      return () => ipcRenderer.removeListener(IpcChannels.poolStatus, listener);
    },
    resize: (size: number): Promise<void> => ipcRenderer.invoke(IpcChannels.poolResize, { size }),
    restartWorker: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.poolRestartWorker, { id }),
  },
  models: {
    refresh: (): Promise<ModelCatalog> => ipcRenderer.invoke(IpcChannels.modelsRefresh),
    onCatalog(cb: (catalog: ModelCatalog) => void): () => void {
      const listener = (_e: unknown, catalog: ModelCatalog): void => cb(catalog);
      ipcRenderer.on(IpcChannels.modelsCatalog, listener);
      return () => ipcRenderer.removeListener(IpcChannels.modelsCatalog, listener);
    },
  },
  omniroute: {
    detect: (): Promise<DetectedRoute[]> => ipcRenderer.invoke(IpcChannels.omnirouteDetect),
  },
  harness: {
    restart: (): Promise<void> => ipcRenderer.invoke(IpcChannels.harnessRestart),
  },
  settings: {
    openFolder: (): Promise<void> => ipcRenderer.invoke(IpcChannels.settingsOpenFolder),
  },
  mcp: {
    getState: (): Promise<EmbeddedMcpState> => ipcRenderer.invoke(IpcChannels.mcpGetState),
    setEnabled: (id: string, enabled: boolean): Promise<EmbeddedMcpState> =>
      ipcRenderer.invoke(IpcChannels.mcpSetEnabled, { id, enabled }),
    openConfig: (): Promise<void> => ipcRenderer.invoke(IpcChannels.mcpOpenConfig),
    onStatus(cb: (status: McpRuntimeStatus) => void): () => void {
      const listener = (_e: unknown, status: McpRuntimeStatus): void => cb(status);
      ipcRenderer.on(IpcChannels.mcpStatus, listener);
      return () => ipcRenderer.removeListener(IpcChannels.mcpStatus, listener);
    },
  },
  warpfleet: {
    enable: (on: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.warpfleetEnable, { enabled: on }),
    onStatus(cb: (payload: IpcPayloads[typeof IpcChannels.warpfleetStatus]) => void): () => void {
      const listener = (
        _e: unknown,
        payload: IpcPayloads[typeof IpcChannels.warpfleetStatus],
      ): void => cb(payload);
      ipcRenderer.on(IpcChannels.warpfleetStatus, listener);
      return () => ipcRenderer.removeListener(IpcChannels.warpfleetStatus, listener);
    },
  },
  locale: {
    set: (locale: 'zh' | 'en' | 'es'): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.localeSet, { locale }),
  },
  ocr: {
    status: (): Promise<{ available: boolean; binaryPath: string | null }> =>
      ipcRenderer.invoke(IpcChannels.ocrStatus),
    extract: (imageBase64: string, lang?: string): Promise<OcrResult> =>
      ipcRenderer.invoke(IpcChannels.ocrExtract, { imageBase64, lang }),
  },
};

contextBridge.exposeInMainWorld('freecode', api);

export type { FreeCodeApi, IpcPayloads, ModelCatalog, DetectedRoute, WorkerHandle, WarpFleetStatus, OcrResult, EmbeddedMcpState, McpRuntimeStatus };
