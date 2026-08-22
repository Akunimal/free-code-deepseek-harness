import { z } from 'zod';

/** WorkerHandle — pool worker snapshot (mirrors opencode-adapter). */
export const WorkerHandleSchema = z.object({
  id: z.string(),
  pid: z.number(),
  port: z.number(),
  status: z.enum(['starting', 'ready', 'unhealthy', 'stopped']),
  startedAt: z.number(),
  restarts: z.number(),
});
export type WorkerHandle = z.infer<typeof WorkerHandleSchema>;

/** CatalogModel — one probed model entry. */
export const CatalogModelSchema = z.object({
  id: z.string(),
  responds: z.boolean(),
  latencyMs: z.number().nullable(),
  lastSeen: z.number(),
});
export type CatalogModel = z.infer<typeof CatalogModelSchema>;

/** ModelCatalog — persisted refresh output. */
export const ModelCatalogSchema = z.object({
  refreshedAt: z.number(),
  availability: z.enum(['ready', 'degraded']).optional(),
  providers: z.record(z.string(), z.object({ models: z.array(CatalogModelSchema) })),
});
export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;

/** DetectedRoute — an OpenAI-compatible endpoint found by the local scan. */
export const DetectedRouteSchema = z.object({
  port: z.number(),
  baseURL: z.string(),
  models: z.array(z.string()),
  latencyMs: z.number(),
});
export type DetectedRoute = z.infer<typeof DetectedRouteSchema>;

/** TorFleet instance snapshot (mirrors torfleet.ts TorInstance). */
export const TorInstanceSchema = z.object({
  index: z.number(),
  socksPort: z.number(),
  controlPort: z.number(),
  pid: z.number(),
  status: z.enum(['starting', 'ready', 'stopped']),
});
export type TorInstance = z.infer<typeof TorInstanceSchema>;

/** IPC channel names (single source of truth for main + preload + renderer). */
export const IpcChannels = {
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
} as const;

export type IpcChannels = typeof IpcChannels;

/** Payloads per channel. */
export interface IpcPayloads {
  [IpcChannels.poolStatus]: { workers: WorkerHandle[] };
  [IpcChannels.poolRestartWorker]: { id: string };
  [IpcChannels.poolResize]: { size: number };
  [IpcChannels.modelsCatalog]: ModelCatalog;
  [IpcChannels.modelsRefresh]: void;
  [IpcChannels.omnirouteDetect]: void;
  [IpcChannels.settingsOpenFolder]: void;
  [IpcChannels.harnessRestart]: void;
  [IpcChannels.torfleetEnable]: { enabled: boolean };
  [IpcChannels.torfleetStatus]: { enabled: boolean; instances: TorInstance[] };
}

/** The API surface exposed on window.freecode by the preload bridge. */
export interface FreeCodeApi {
  pool: {
    onStatus(cb: (payload: IpcPayloads[typeof IpcChannels.poolStatus]) => void): () => void;
    resize(size: number): Promise<void>;
  };
  models: {
    refresh(): Promise<ModelCatalog>;
    onCatalog(cb: (catalog: ModelCatalog) => void): () => void;
  };
  omniroute: {
    detect(): Promise<DetectedRoute[]>;
  };
  harness: {
    restart(): Promise<void>;
  };
  settings: {
    openFolder(): Promise<void>;
  };
  torfleet: {
    enable(on: boolean): Promise<void>;
    onStatus(cb: (payload: IpcPayloads[typeof IpcChannels.torfleetStatus]) => void): () => void;
  };
}

export * from './chat.js';
