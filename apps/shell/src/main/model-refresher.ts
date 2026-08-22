import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { reasoningEffortsForModel } from './reasoning-policy.js';

/**
 * Model refresher — probes /v1/models through the LB, pings each model,
 * persists a catalog, and syncs responding models into settings.yaml
 * (sorted by latency asc). Runs at app.ready, then every 30 min, and on
 * demand (Refresh button).
 */

export interface CatalogModel {
  id: string;
  responds: boolean;
  latencyMs: number | null;
  lastSeen: number;
}

export interface ModelCatalog {
  refreshedAt: number;
  availability?: 'ready' | 'degraded';
  providers: Record<string, { models: CatalogModel[] }>;
}

export type ModelRefreshFailureCode = 'CATALOG_UNAVAILABLE';

export class ModelRefreshError extends Error {
  readonly code: ModelRefreshFailureCode;

  constructor(code: ModelRefreshFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ModelRefreshError';
    this.code = code;
  }
}

export interface RefresherConfig {
  lbBaseUrl: string; // http://127.0.0.1:<PUERTO_LB>
  homeDir: string; // DSH_HOME (settings.yaml lives here)
  userDataDir: string; // model-catalog.json lives here
  authHeader?: string; // e.g. 'Bearer public'
  probeTimeoutMs?: number; // default 5000
  onUpdate?: (catalog: ModelCatalog) => void;
}

const CATALOG_FILE = 'model-catalog.json';
const PROBE_TIMEOUT_MS = 5_000;

export async function refreshModels(cfg: RefresherConfig): Promise<ModelCatalog> {
  const timeoutMs = cfg.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  const authHeader = cfg.authHeader;

  // 1. List models through the LB.
  let modelsRes: Response;
  try {
    modelsRes = await fetch(`${cfg.lbBaseUrl}/v1/models`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog request failed', { cause: error });
  }
  if (!modelsRes.ok) throw new ModelRefreshError('CATALOG_UNAVAILABLE', `models list failed: ${modelsRes.status}`);
  const modelsBody = (await modelsRes.json()) as { data: { id: string }[] };
  const ids: string[] = (modelsBody.data ?? []).map((m) => m.id);
  if (ids.length === 0) throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog returned no models');

  // 2. Probe each model in parallel (bounded by timeout).
  const entries: CatalogModel[] = await Promise.all(
    ids.map(async (id) => {
      const started = Date.now();
      let responds = false;
      let latencyMs: number | null = null;
      try {
        const res = await fetch(`${cfg.lbBaseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({
            model: id,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        latencyMs = Date.now() - started;
        responds = res.ok;
      } catch {
        responds = false;
        latencyMs = null;
      }
      return { id, responds, latencyMs, lastSeen: Math.floor(Date.now() / 1000) };
    }),
  );

  // 3. Persist catalog (all models, responders + non-responders).
  const catalog: ModelCatalog = {
    refreshedAt: Math.floor(Date.now() / 1000),
    availability: entries.some((model) => model.responds) ? 'ready' : 'degraded',
    providers: { 'deepseek-free': { models: entries } },
  };
  const catalogPath = join(cfg.userDataDir, CATALOG_FILE);
  mkdirSync(cfg.userDataDir, { recursive: true });
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

  // 4. Sync settings.yaml models: only responders, latency asc. Upstream
  // schema wants model objects ({id,...}), not bare strings — a plain string
  // list fails the llm-pi-ai route validator.
  const responders = entries
    .filter((m) => m.responds)
    .sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity));
  const settingsPath = join(cfg.homeDir, 'settings.yaml');
  const settings = readSettings(settingsPath);
  const section = settings['llm-pi-ai'] ?? (settings['llm-pi-ai'] = {});
  const providers = section.providers ?? (section.providers = {});
  // Ensure the deepseek-free entry exists (seed may not have run yet).
  const free = providers['deepseek-free'] ?? (providers['deepseek-free'] = {
    api: 'openai-completions',
    baseURL: cfg.lbBaseUrl,
    apiKeyEnv: 'FREECODE_PUBLIC_KEY',
    defaultInput: ['text'],
    models: [],
  });
  // A live catalog with zero responding probes is a degraded upstream, not a
  // reason to erase the last known-good automatic model selection.
  if (responders.length > 0) {
    free.models = responders.map((m) => {
      return { id: m.id, reasoningEfforts: reasoningEffortsForModel(m.id) };
    });
  }
  writeSettings(settingsPath, settings);

  cfg.onUpdate?.(catalog);
  return catalog;
}

function readSettings(path: string): Record<string, any> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  if (!raw.trim()) return {};
  const parsed = loadYaml(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, any>;
}

function writeSettings(path: string, settings: Record<string, any>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, dumpYaml(settings, { noRefs: true, lineWidth: 120 }), 'utf8');
}
