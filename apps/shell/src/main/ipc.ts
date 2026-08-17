import { ipcMain, BrowserWindow, shell } from 'electron';
import {
  IpcChannels,
  IpcPayloads,
  ModelCatalogSchema,
  WorkerHandleSchema,
} from '@freecode/shared-types';
import { ShellRuntime } from './runtime.js';
import { detectLocalRoutes } from './omniroute-detector.js';
import { refreshModels } from './model-refresher.js';
import { join } from 'node:path';

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
}

export function registerIpc(deps: IpcDeps): () => void {
  const { runtime, userDataDir, homeDir, lbBaseUrl } = deps;

  // pool:status (push on change)
  const emitStatus = (): void => {
    const payload: IpcPayloads[typeof IpcChannels.poolStatus] = {
      workers: runtime.workers().map((w) => WorkerHandleSchema.parse(w)),
    };
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.poolStatus, payload);
    }
  };
  const offChange = runtime.pool.onWorkerChange(() => emitStatus());

  // models:refresh (invoke)
  ipcMain.handle(IpcChannels.modelsRefresh, async () => {
    const catalog = await refreshModels({
      lbBaseUrl,
      homeDir,
      userDataDir,
      authHeader: 'Bearer public',
    });
    const parsed = ModelCatalogSchema.parse(catalog);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.modelsCatalog, parsed);
    }
    return parsed;
  });

  // omniroute:detect (invoke)
  ipcMain.handle(IpcChannels.omnirouteDetect, () => detectLocalRoutes());

  // harness:restart (invoke)
  ipcMain.handle(IpcChannels.harnessRestart, () => runtime.supervisor.restart());

  // pool:restartWorker (invoke)
  ipcMain.handle(
    IpcChannels.poolRestartWorker,
    (_e, payload: IpcPayloads[typeof IpcChannels.poolRestartWorker]) =>
      runtime.pool.restartWorker(payload.id),
  );

  // settings:openFolder (invoke) — reveal DSH_HOME in the OS file manager
  ipcMain.handle(IpcChannels.settingsOpenFolder, () => shell.openPath(homeDir));

  return () => {
    offChange();
    ipcMain.removeHandler(IpcChannels.modelsRefresh);
    ipcMain.removeHandler(IpcChannels.omnirouteDetect);
    ipcMain.removeHandler(IpcChannels.harnessRestart);
    ipcMain.removeHandler(IpcChannels.poolRestartWorker);
    ipcMain.removeHandler(IpcChannels.settingsOpenFolder);
  };
}