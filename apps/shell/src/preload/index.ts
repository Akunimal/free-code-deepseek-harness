import { contextBridge, ipcRenderer } from 'electron';
import {
  FreeCodeApi,
  IpcChannels,
  IpcPayloads,
  ModelCatalog,
  DetectedRoute,
  WorkerHandle,
} from '@freecode/shared-types';

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
};

contextBridge.exposeInMainWorld('freecode', api);

export type { FreeCodeApi, IpcPayloads, ModelCatalog, DetectedRoute, WorkerHandle };
