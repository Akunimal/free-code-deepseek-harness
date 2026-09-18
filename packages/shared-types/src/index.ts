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

/** WarpFleet status snapshot (mirrors warfleet.ts WarpFleetStatus). */
export const WarpFleetStatusSchema = z.object({
  active: z.boolean(),
  rotating: z.boolean(),
  cooldownMs: z.number(),
  lastError: z.string().nullable().optional(),
});
export type WarpFleetStatus = z.infer<typeof WarpFleetStatusSchema>;

/** IPC channel names (single source of truth for main + preload + renderer). */
export const IpcChannels = {
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
  [IpcChannels.mcpGetState]: void;
  [IpcChannels.mcpSetEnabled]: { id: string; enabled: boolean };
  [IpcChannels.mcpOpenConfig]: void;
  [IpcChannels.mcpStatus]: McpRuntimeStatus;
  [IpcChannels.harnessRestart]: void;
  [IpcChannels.warpfleetEnable]: { enabled: boolean };
  [IpcChannels.warpfleetStatus]: { enabled: boolean; status: WarpFleetStatus | null };
  [IpcChannels.localeSet]: { locale: 'zh' | 'en' | 'es' };
  [IpcChannels.ocrExtract]: { imageBase64: string; lang?: string };
  [IpcChannels.ocrStatus]: { available: boolean; binaryPath: string | null };
}

/** OCR result returned from ocr:extract. */
export interface OcrResult {
  text: string;
  confidence: number;
  language: string;
  durationMs: number;
}

/** The API surface exposed on window.freecode by the preload bridge. */
export interface FreeCodeApi {
  pool: {
    onStatus(cb: (payload: IpcPayloads[typeof IpcChannels.poolStatus]) => void): () => void;
    resize(size: number): Promise<void>;
    restartWorker(id: string): Promise<void>;
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
  mcp: {
    getState(): Promise<EmbeddedMcpState>;
    setEnabled(id: string, enabled: boolean): Promise<EmbeddedMcpState>;
    openConfig(): Promise<void>;
    onStatus(cb: (status: McpRuntimeStatus) => void): () => void;
  };
  warpfleet: {
    enable(on: boolean): Promise<void>;
    onStatus(cb: (payload: IpcPayloads[typeof IpcChannels.warpfleetStatus]) => void): () => void;
  };
  locale: {
    set(locale: 'zh' | 'en' | 'es'): Promise<void>;
  };
  ocr: {
    status(): Promise<{ available: boolean; binaryPath: string | null }>;
    extract(imageBase64: string, lang?: string): Promise<OcrResult>;
  };
}

/** Public, non-secret projection of the product-managed MCP catalog. */
export interface EmbeddedMcpServer {
  id: string;
  serverName: string;
  transport: 'stdio' | 'streamable-http';
  command: string;
  args: string[];
  cwd: string;
  enabled: boolean;
  optionalPrerequisite?: string;
  runtime?: McpRuntimeStatus;
}

/** Runtime evidence for one managed MCP server, derived from the live bridge. */
export const McpRuntimeStatusSchema = z.object({
  serverId: z.string().min(1),
  state: z.enum(['disabled', 'starting', 'ready', 'degraded', 'failed']),
  toolCount: z.number().int().min(0),
  error: z.string().max(1_024).optional(),
});
export type McpRuntimeStatus = z.infer<typeof McpRuntimeStatusSchema>;

export interface EmbeddedMcpState {
  configPath: string;
  servers: EmbeddedMcpServer[];
}

export * from './chat.js';
