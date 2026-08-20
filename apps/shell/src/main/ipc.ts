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
import { z } from 'zod';
import type { TorFleet } from './torfleet.js';

const PoolResizePayloadSchema = z.object({ size: z.number().int().min(1).max(16) });

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
  torfleet: {
    instance: TorFleet | null;
    enable(on: boolean): Promise<void>;
    isEnabled(): boolean;
  };
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

  // pool:resize — live account/worker-slot slider, bounded to the adapter contract.
  ipcMain.handle(IpcChannels.poolResize, (_e, payload: unknown) => {
    const parsed = PoolResizePayloadSchema.parse(payload);
    return runtime.pool.resize(parsed.size);
  });

  // settings:openFolder (invoke) — reveal DSH_HOME in the OS file manager
  ipcMain.handle(IpcChannels.settingsOpenFolder, () => shell.openPath(homeDir));

  // torfleet:enable (invoke)
  ipcMain.handle(IpcChannels.torfleetEnable, async (_e, payload: { enabled: boolean }) => {
    await deps.torfleet.enable(payload.enabled);
    emitTorfleetStatus();
  });

  const emitTorfleetStatus = (): void => {
    const tf = deps.torfleet;
    const payload: IpcPayloads[typeof IpcChannels.torfleetStatus] = {
      enabled: tf.isEnabled(),
      instances: tf.instance?.status() ?? [],
    };
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.torfleetStatus, payload);
    }
  };

  let offTorfleetChange: (() => void) | null = null;
  if (deps.torfleet.instance) {
    offTorfleetChange = deps.torfleet.instance.onChange(() => emitTorfleetStatus());
  }

  return () => {
    offChange();
    offTorfleetChange?.();
    ipcMain.removeHandler(IpcChannels.modelsRefresh);
    ipcMain.removeHandler(IpcChannels.omnirouteDetect);
    ipcMain.removeHandler(IpcChannels.harnessRestart);
    ipcMain.removeHandler(IpcChannels.poolRestartWorker);
    ipcMain.removeHandler(IpcChannels.poolResize);
    ipcMain.removeHandler(IpcChannels.settingsOpenFolder);
    ipcMain.removeHandler(IpcChannels.torfleetEnable);
  };
}
