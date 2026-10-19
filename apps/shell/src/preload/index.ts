import { contextBridge, ipcRenderer } from 'electron';
import type {
  FreeCodeApi,
  IpcPayloads,
  ModelCatalog,
  ModelCatalogRefreshState,
  OcrResult,
  EmbeddedMcpState,
  McpRuntimeStatus,
} from '@freecode/shared-types';

const IpcChannels = {
  modelsCatalog: 'models:catalog',
  modelsRefresh: 'models:refresh',
  modelsRefreshState: 'models:refreshState',
  modelsGetRefreshState: 'models:getRefreshState',
  settingsOpenFolder: 'settings:openFolder',
  mcpGetState: 'mcp:getState',
  mcpSetEnabled: 'mcp:setEnabled',
  mcpOpenConfig: 'mcp:openConfig',
  mcpStatus: 'mcp:status',
  harnessRestart: 'harness:restart',
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
  models: {
    refresh: (): Promise<ModelCatalog> => ipcRenderer.invoke(IpcChannels.modelsRefresh),
    onCatalog(cb: (catalog: ModelCatalog) => void): () => void {
      const listener = (_e: unknown, catalog: ModelCatalog): void => cb(catalog);
      ipcRenderer.on(IpcChannels.modelsCatalog, listener);
      return () => ipcRenderer.removeListener(IpcChannels.modelsCatalog, listener);
    },
    getRefreshState: (): Promise<ModelCatalogRefreshState> =>
      ipcRenderer.invoke(IpcChannels.modelsGetRefreshState),
    onRefreshState(cb: (state: ModelCatalogRefreshState) => void): () => void {
      const listener = (_e: unknown, state: ModelCatalogRefreshState): void => cb(state);
      ipcRenderer.on(IpcChannels.modelsRefreshState, listener);
      return () => ipcRenderer.removeListener(IpcChannels.modelsRefreshState, listener);
    },
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

export type { FreeCodeApi, IpcPayloads, ModelCatalog, ModelCatalogRefreshState, OcrResult, EmbeddedMcpState, McpRuntimeStatus };
