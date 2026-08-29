import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { reasoningEffortsForModel } from './reasoning-policy.js';

/**
 * Model refresher — probes OpenAI-compatible provider routes, persists a
 * catalog, and syncs responding models into settings.yaml (sorted by latency
 * asc). The OpenCode Free pool remains the required primary route; optional
 * local providers can be refreshed without making the whole refresh fail.
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

export interface ProviderRefreshTarget {
  /** Settings route key and catalog provider key. */
  provider: string;
  /** Endpoint root; `/v1/models` and `/v1/chat/completions` are appended. */
  baseUrl: string;
  /** Optional Authorization value, for example `Bearer public`. */
  authHeader?: string;
  /** Set false for static local gateways where probing every model is costly. */
  probeModels?: boolean;
  /** Models that should remain visible when a transient probe fails. */
  alwaysExposedModels?: ReadonlySet<string>;
  /** Schema-valid seed models used when the route has not answered yet. */
  fallbackModels?: readonly string[];
}

export interface RefresherConfig {
  lbBaseUrl: string; // http://127.0.0.1:<PUERTO_LB>
  homeDir: string; // DSH_HOME (settings.yaml lives here)
  userDataDir: string; // model-catalog.json lives here
  authHeader?: string; // e.g. 'Bearer public'
  providers?: readonly ProviderRefreshTarget[];
  probeTimeoutMs?: number; // default 120000; free models can take >60s to answer
  onUpdate?: (catalog: ModelCatalog) => void;
}

const CATALOG_FILE = 'model-catalog.json';
// x-preview-f has been observed taking about a minute on a cold/upstream path.
// A short probe timeout makes a healthy, advertised model disappear from the
// user's selector while an in-flight request is still viable.
const PROBE_TIMEOUT_MS = 120_000;
const ALWAYS_EXPOSED_MODELS = new Set(['x-preview-f']);
const FREE_PROVIDER = 'deepseek-free';

export async function refreshModels(cfg: RefresherConfig): Promise<ModelCatalog> {
  const timeoutMs = cfg.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  const targets: ProviderRefreshTarget[] = [
    {
      provider: FREE_PROVIDER,
      baseUrl: cfg.lbBaseUrl,
      authHeader: cfg.authHeader,
      alwaysExposedModels: ALWAYS_EXPOSED_MODELS,
      fallbackModels: ['x-preview-f'],
    },
    ...(cfg.providers ?? []).filter((target) => target.provider !== FREE_PROVIDER),
  ];

  // The primary pool preserves the historical error contract. An optional
  // provider may be offline, though, so its failure becomes an empty/degraded
  // entry while the main catalog remains usable.
  const results = await Promise.all(targets.map(async (target, index) => {
    try {
      const ids = await listModelIds(target, timeoutMs);
      const entries = await probeModels(target, ids, timeoutMs);
      return { target, entries };
    } catch (error) {
      if (index === 0) throw error;
      return { target, entries: [] as CatalogModel[] };
    }
  }));

  const catalog: ModelCatalog = {
    refreshedAt: Math.floor(Date.now() / 1000),
    availability: results.some(({ entries }) => entries.some((model) => model.responds))
      ? 'ready'
      : 'degraded',
    providers: Object.fromEntries(results.map(({ target, entries }) => [target.provider, { models: entries }])),
  };
  const catalogPath = join(cfg.userDataDir, CATALOG_FILE);
  mkdirSync(cfg.userDataDir, { recursive: true });
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

  // Sync all configured targets in one YAML read/write so user sections and
  // custom provider fields survive the refresh.
  const settingsPath = join(cfg.homeDir, 'settings.yaml');
  const settings = readSettings(settingsPath);
  const section = settings['llm-pi-ai'] ?? (settings['llm-pi-ai'] = {});
  const providers = section.providers ?? (section.providers = {});
  for (const { target, entries } of results) {
    syncProviderModels(providers, target, entries);
  }
  writeSettings(settingsPath, settings);

  cfg.onUpdate?.(catalog);
  return catalog;
}

async function listModelIds(target: ProviderRefreshTarget, timeoutMs: number): Promise<string[]> {
  const url = endpointUrl(target.baseUrl, '/models');
  let response: Response;
  try {
    response = await fetch(url, {
      headers: target.authHeader ? { Authorization: target.authHeader } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog request failed', { cause: error });
  }
  if (!response.ok) throw new ModelRefreshError('CATALOG_UNAVAILABLE', `models list failed: ${response.status}`);
  const modelsBody = (await response.json()) as { data?: unknown };
  if (!Array.isArray(modelsBody.data)) {
    throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog returned an invalid data list');
  }
  const ids = modelsBody.data
    .map((model) => (model && typeof model === 'object' && typeof (model as { id?: unknown }).id === 'string'
      ? (model as { id: string }).id
      : null))
    .filter((id): id is string => id !== null);
  if (ids.length === 0) {
    throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog returned no models');
  }
  return ids;
}

async function probeModels(
  target: ProviderRefreshTarget,
  ids: readonly string[],
  timeoutMs: number,
): Promise<CatalogModel[]> {
  if (target.probeModels === false) {
    return ids.map((id) => ({ id, responds: true, latencyMs: null, lastSeen: nowSeconds() }));
  }
  return Promise.all(ids.map(async (id) => {
    const started = Date.now();
    let responds = false;
    let latencyMs: number | null = null;
    try {
      const res = await fetch(endpointUrl(target.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(target.authHeader ? { Authorization: target.authHeader } : {}),
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
    return { id, responds, latencyMs, lastSeen: nowSeconds() };
  }));
}

function syncProviderModels(
  providers: Record<string, Record<string, any>>,
  target: ProviderRefreshTarget,
  entries: CatalogModel[],
): void {
  const provider = providers[target.provider] ?? (providers[target.provider] = {
    api: 'openai-completions',
    baseURL: providerBaseUrl(target.baseUrl),
    ...(target.provider === FREE_PROVIDER ? { apiKeyEnv: 'FREECODE_PUBLIC_KEY' } : {}),
    defaultInput: target.provider === FREE_PROVIDER ? ['text'] : ['text', 'image'],
    models: [],
  });
  const responders = entries
    .filter((model) => model.responds)
    .sort((a, b) => {
      const aLatency = a.latencyMs ?? Infinity;
      const bLatency = b.latencyMs ?? Infinity;
      // Date.now() has millisecond resolution; treating a one-millisecond
      // difference as meaningful would make the selector order depend on
      // event-loop scheduling for equally fast responses. Preserve the
      // upstream order within that measurement jitter, while still putting
      // genuinely faster models first.
      if (Math.abs(aLatency - bLatency) <= 1) return 0;
      return aLatency - bLatency;
    });
  const advertisedFallbacks = entries.filter((model) => target.alwaysExposedModels?.has(model.id));
  if (responders.length > 0) {
    const responderIds = new Set(responders.map((model) => model.id));
    provider.models = [...responders, ...advertisedFallbacks.filter((model) => !responderIds.has(model.id))]
      .map((model) => ({ id: model.id, reasoningEfforts: reasoningEffortsForModel(model.id) }));
    return;
  }

  // A degraded upstream is not a reason to erase the last known-good list.
  // If there is no prior list, install the target's static seed so the
  // upstream settings validator still accepts the route.
  const current = Array.isArray(provider.models) ? provider.models : [];
  const currentIds = new Set(current.map((model: any) => typeof model === 'string' ? model : model?.id));
  const appendedIds = new Set(currentIds);
  const fallbackEntries = (target.fallbackModels ?? [])
    .filter((id) => !appendedIds.has(id))
    .map((id) => {
      appendedIds.add(id);
      return { id, reasoningEfforts: reasoningEffortsForModel(id) };
    });
  const fallbackAdvertised = advertisedFallbacks
    .filter((model) => !appendedIds.has(model.id))
    .map((model) => {
      appendedIds.add(model.id);
      return { id: model.id, reasoningEfforts: reasoningEffortsForModel(model.id) };
    });
  if (fallbackEntries.length > 0 || fallbackAdvertised.length > 0) {
    provider.models = [...current, ...fallbackEntries, ...fallbackAdvertised];
  }
}

function endpointUrl(baseUrl: string, suffix: string): string {
  const base = baseUrl.replace(/\/+$/u, '');
  return `${base.endsWith('/v1') ? base : `${base}/v1`}${suffix}`;
}

function providerBaseUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/u, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
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
