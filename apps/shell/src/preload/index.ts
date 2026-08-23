import { contextBridge, ipcRenderer } from 'electron';
import type {
  FreeCodeApi,
  IpcPayloads,
  ModelCatalog,
  DetectedRoute,
  WorkerHandle,
  TorInstance,
} from '@freecode/shared-types';

const IpcChannels = {
  poolStatus: 'pool:status',
  poolRestartWorker: 'pool:restartWorker',
  poolResize: 'pool:resize',
  modelsCatalog: 'models:catalog',
  modelsRefresh: 'models:refresh',
  omnirouteDetect: 'omniroute:detect',
  settingsOpenFolder: 'settings:openFolder',
  harnessRestart: 'harness:restart',
  torfleetEnable: 'torfleet:enable',
  torfleetStatus: 'torfleet:status',
  localeSet: 'locale:set',
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
  torfleet: {
    enable: (on: boolean): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.torfleetEnable, { enabled: on }),
    onStatus(cb: (payload: IpcPayloads[typeof IpcChannels.torfleetStatus]) => void): () => void {
      const listener = (
        _e: unknown,
        payload: IpcPayloads[typeof IpcChannels.torfleetStatus],
      ): void => cb(payload);
      ipcRenderer.on(IpcChannels.torfleetStatus, listener);
      return () => ipcRenderer.removeListener(IpcChannels.torfleetStatus, listener);
    },
  },
  locale: {
    set: (locale: 'zh' | 'en' | 'es'): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.localeSet, { locale }),
  },
};

contextBridge.exposeInMainWorld('freecode', api);

export type { FreeCodeApi, IpcPayloads, ModelCatalog, DetectedRoute, WorkerHandle, TorInstance };
