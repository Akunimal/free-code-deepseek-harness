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

/** Shell-owned model catalog refresh lifecycle, safe to expose to the UI. */
export const ModelCatalogRefreshStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  status: z.enum(['idle', 'loading']),
  startedAt: z.number().int().nonnegative().nullable(),
}).superRefine((value, ctx) => {
  if (value.status === 'loading' && value.startedAt === null) {
    ctx.addIssue({ code: 'custom', message: 'loading catalog state requires startedAt', path: ['startedAt'] });
  }
  if (value.status === 'idle' && value.startedAt !== null) {
    ctx.addIssue({ code: 'custom', message: 'idle catalog state cannot retain startedAt', path: ['startedAt'] });
  }
});
export type ModelCatalogRefreshState = z.infer<typeof ModelCatalogRefreshStateSchema>;

/** Tor resilience status snapshot. */
export const TorStatusSchema = z.object({
  active: z.boolean(),
  status: z.enum(['stopped', 'starting', 'ready', 'rotating', 'failed']),
  socksPort: z.number(),
  controlPort: z.number(),
  pid: z.number(),
  circuitCount: z.number(),
  lastRotatedAt: z.number().nullable(),
  lastError: z.string().nullable(),
});
export type TorStatus = z.infer<typeof TorStatusSchema>;

/** IPC channel names (single source of truth for main + preload + renderer). */
export const IpcChannels = {
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
  gentleAiStatus: 'gentle-ai:status',
  gentleAiDoctor: 'gentle-ai:doctor',
  gentleAiRun: 'gentle-ai:run',
} as const;

export type IpcChannels = typeof IpcChannels;

/** Payloads per channel. */
export interface IpcPayloads {
  [IpcChannels.modelsCatalog]: ModelCatalog;
  [IpcChannels.modelsRefresh]: void;
  [IpcChannels.modelsRefreshState]: ModelCatalogRefreshState;
  [IpcChannels.modelsGetRefreshState]: void;
  [IpcChannels.settingsOpenFolder]: void;
  [IpcChannels.mcpGetState]: void;
  [IpcChannels.mcpSetEnabled]: { id: string; enabled: boolean };
  [IpcChannels.mcpOpenConfig]: void;
  [IpcChannels.mcpStatus]: McpRuntimeStatus;
  [IpcChannels.harnessRestart]: void;
  [IpcChannels.localeSet]: { locale: 'zh' | 'en' | 'es' };
  [IpcChannels.ocrExtract]: { imageBase64: string; lang?: string };
  [IpcChannels.ocrStatus]: { available: boolean; binaryPath: string | null };
  [IpcChannels.gentleAiStatus]: void;
  [IpcChannels.gentleAiDoctor]: void;
  [IpcChannels.gentleAiRun]: GentleAiRunRequest;
}

/** Gentle-AI status response (no secrets). */
export const GentleAiStatusSchema = z.object({
  available: z.boolean(),
  binaryPath: z.string().nullable(),
  doctorPass: z.boolean().nullable(),
});
export type GentleAiStatus = z.infer<typeof GentleAiStatusSchema>;

/** Gentle-AI doctor check row. */
export const GentleAiDoctorCheckSchema = z.object({
  name: z.string().min(1).max(64),
  pass: z.boolean(),
  message: z.string().max(1_024).optional(),
});
export type GentleAiDoctorCheck = z.infer<typeof GentleAiDoctorCheckSchema>;

/** Gentle-AI doctor result (no secrets). */
export const GentleAiDoctorSchema = z.object({
  pass: z.boolean(),
  checks: z.array(GentleAiDoctorCheckSchema).max(16),
});
export type GentleAiDoctor = z.infer<typeof GentleAiDoctorSchema>;

/** Bounded gentle-ai:run request. Input cap 64KB (prompt text). */
export const GENTLE_AI_INPUT_CAP = 64 * 1024;
export const GENTLE_AI_OUTPUT_CAP = 256 * 1024;
export const GENTLE_AI_TIMEOUT_MS = 30_000;
export const GentleAiRunRequestSchema = z.object({
  prompt: z.string().min(1).max(GENTLE_AI_INPUT_CAP),
  timeoutMs: z.number().int().min(100).max(GENTLE_AI_TIMEOUT_MS).optional(),
  allowGlobal: z.boolean().optional(),
});
export type GentleAiRunRequest = z.infer<typeof GentleAiRunRequestSchema>;

/** Bounded gentle-ai:run response. */
export const GentleAiRunResponseSchema = z.union([
  z.object({ output: z.string().max(GENTLE_AI_OUTPUT_CAP), truncated: z.boolean() }),
  z.object({ error: z.enum(['size', 'timeout', 'validation', 'blocked-global']) }),
]);
export type GentleAiRunResponse = z.infer<typeof GentleAiRunResponseSchema>;

/** OCR result returned from ocr:extract. */
export interface OcrResult {
  text: string;
  confidence: number;
  language: string;
  durationMs: number;
}

/** The API surface exposed on window.freecode by the preload bridge. */
export interface FreeCodeApi {
  models: {
    refresh(): Promise<ModelCatalog>;
    onCatalog(cb: (catalog: ModelCatalog) => void): () => void;
    getRefreshState(): Promise<ModelCatalogRefreshState>;
    onRefreshState(cb: (state: ModelCatalogRefreshState) => void): () => void;
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
  locale: {
    set(locale: 'zh' | 'en' | 'es'): Promise<void>;
  };
  ocr: {
    status(): Promise<{ available: boolean; binaryPath: string | null }>;
    extract(imageBase64: string, lang?: string): Promise<OcrResult>;
  };
  gentleAi: {
    status(): Promise<GentleAiStatus>;
    doctor(): Promise<GentleAiDoctor>;
    run(prompt: string, opts?: { timeoutMs?: number; allowGlobal?: boolean }): Promise<GentleAiRunResponse>;
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
