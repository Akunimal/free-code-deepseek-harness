import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { compatForModel, reasoningEffortsForModelWithHint } from './reasoning-policy.js';

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
  failureKind?: 'http' | 'transport';
  statusCode?: number;
  /** The route had a prior HTTP-200 probe; its current probe had no response. */
  lastKnownGood?: boolean;
}

export interface ModelCatalog {
  refreshedAt: number;
  availability?: 'ready' | 'degraded';
  providers: Record<string, { models: CatalogModel[] }>;
  /** Last routes proven with HTTP 200, retained only across transport failures. */
  lastKnownGoodByProvider?: Record<string, string[]>;
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
  /** Explicit free-only allowlist; excluded ids are never probed. */
  exactModelIds?: readonly string[];
  /** Managed sidecars choose a new loopback port after each start. */
  refreshBaseUrl?: boolean;
  /** Settings route key and catalog provider key. */
  provider: string;
  /** Endpoint root; `/v1/models` and `/v1/chat/completions` are appended. */
  baseUrl: string;
  /** Optional Authorization value, for example `Bearer public`. */
  authHeader?: string;
  /** Credential reference written to settings (`apiKeyEnv`); set for
   *  non-free providers that authenticate like the built-in pool. */
  apiKeyEnv?: string;
  /** Profile input modalities (settings `defaultInput`); defaults to the
   *  legacy non-free shape. */
  defaultInput?: string[];
  /** Set false for static local gateways where probing every model is costly. */
  probeModels?: boolean;
  /** Models that should remain visible when a transient probe fails. */
  alwaysExposedModels?: ReadonlySet<string>;
  /** Schema-valid seed models used when the route has not answered yet. */
  fallbackModels?: readonly string[];
  /** When true, settings expose ONLY probed responders: with zero responders
   *  the synced list is erased except for previously HTTP-200-verified models
   *  whose current probe failed before an HTTP response. Explicit HTTP
   *  rejections and newly advertised IDs are never retained. */
  strictResponders?: boolean;
}

/**
 * Decide whether a successful refresh still deserves a short bounded retry.
 * Empty free catalogs, transport failures, and transient HTTP statuses can
 * recover quickly. Permanent protocol/auth 4xx responses must not create a
 * retry loop; the regular long refresh cadence will re-check them later.
 */
export function shouldRetryModelRefresh(catalog: ModelCatalog): boolean {
  const models = catalog.providers['deepseek-free']?.models ?? [];
  if (models.length === 0) return true;
  return models.some(isRetryableModelProbeFailure);
}

function isRetryableModelProbeFailure(model: CatalogModel): boolean {
  return model.failureKind === 'transport'
    || (model.failureKind === 'http'
      && (model.statusCode === 408 || model.statusCode === 429
        || (model.statusCode !== undefined && model.statusCode >= 500 && model.statusCode < 600)));
}

export interface RefresherConfig {
  /** A completed primary request failed; sync an empty primary while probing fallback. */
  primaryUnavailable?: boolean;
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
const FREE_PROVIDER = 'deepseek-free';

export async function refreshModels(cfg: RefresherConfig): Promise<ModelCatalog> {
  const timeoutMs = cfg.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  const previousLastKnownGood = readLastKnownGoodByProvider(cfg.userDataDir);
  const targets: ProviderRefreshTarget[] = [
    {
      provider: FREE_PROVIDER,
      baseUrl: cfg.lbBaseUrl,
      authHeader: cfg.authHeader,
      // 0.9.1: the anonymous lane exposes ONLY 200 responders. With zero
      // responders the synced list is erased (never stale/dead models in
      // the selector); bounded refresh retries repopulate it on recovery.
      strictResponders: true,
    },
    ...(cfg.providers ?? []).filter((target) => target.provider !== FREE_PROVIDER),
  ];

  // Discover candidates first, but do not make them routable in DSH settings
  // until the strict lane has completed its bounded probes. The selector and
  // Host both consume settings.yaml; publishing candidates here would let an
  // unverified or protocol-rejected route slip through while a slow probe is
  // still running. A slow model may take up to two minutes, so keep the UI in
  // its explicit "checking"/blocked state until the 200-only result is ready.
  const listings = await Promise.all(targets.map(async (target, index) => {
    if (index === 0 && cfg.primaryUnavailable) return { target, ids: [] as string[] };
    try {
      return { target, ids: await listModelIds(target, timeoutMs) };
    } catch (error) {
      // The required primary catalog keeps its historical failure contract.
      // An optional provider can be offline without failing the primary list.
      if (index === 0) throw error;
      return { target, ids: [] as string[], listFailed: true as const };
    }
  }));

  const reasoningHints = loadGatewayReasoningFlags(cfg.userDataDir);

  // Keep optional-provider failures isolated and probe route IDs in parallel.
  const results = await Promise.all(listings.map(async (listing, index) => {
    if ((listing as { listFailed?: true }).listFailed === true) {
      return { target: listing.target, entries: [] as CatalogModel[] };
    }
    if (index === 0 && cfg.primaryUnavailable) return { target: listing.target, entries: [] as CatalogModel[] };
    try {
      return { target: listing.target, entries: await probeModels(listing.target, listing.ids, timeoutMs) };
    } catch (error) {
      if (index === 0) throw error;
      return { target: listing.target, entries: [] as CatalogModel[] };
    }
  }));

  // A transport failure is not proof that a formerly-working model changed
  // protocol or disappeared. Keep only routes with prior HTTP-200 evidence
  // that remain advertised and failed without an HTTP response. Any explicit
  // HTTP status (especially the unsupported-protocol 400) retires that ID.
  const lastKnownGoodByProvider: Record<string, string[]> = {};
  for (const { target, entries } of results) {
    const previouslyVerified = new Set(previousLastKnownGood[target.provider] ?? []);
    const retained: string[] = [];
    for (const entry of entries) {
      if (entry.responds) {
        retained.push(entry.id);
      } else if (entry.failureKind === 'transport' && previouslyVerified.has(entry.id)) {
        entry.lastKnownGood = true;
        retained.push(entry.id);
      }
    }
    lastKnownGoodByProvider[target.provider] = retained;
  }

  const catalog: ModelCatalog = {
    refreshedAt: Math.floor(Date.now() / 1000),
    availability: results.some(({ entries }) => entries.some((model) => model.responds))
      && !results.some(({ entries }) => entries.some((model) => model.lastKnownGood || isRetryableModelProbeFailure(model)))
      ? 'ready'
      : 'degraded',
    providers: Object.fromEntries(results.map(({ target, entries }) => [target.provider, { models: entries }])),
    lastKnownGoodByProvider,
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
    syncProviderModels(providers, target, entries, reasoningHints);
  }
  const responders = results.find(({ target }) => target.provider === FREE_PROVIDER)?.entries
    .filter(model => model.responds).map(model => model.id) ?? [];
  const defaultModel = settings['agent-default-model'] as { provider?: unknown; model?: unknown } | undefined;
  const hasValidDefault = typeof defaultModel?.provider === 'string' && typeof defaultModel.model === 'string';
  if (responders[0] !== undefined && (!hasValidDefault
    || (defaultModel.provider === FREE_PROVIDER && !responders.includes(defaultModel.model as string)))) {
    // New Sessions get a verified route after migration or when their old
    // selection is no longer served. Existing Session history stays intact.
    settings['agent-default-model'] = { provider: FREE_PROVIDER, model: responders[0] };
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
  if (response.status !== 200) throw new ModelRefreshError('CATALOG_UNAVAILABLE', `models list failed: ${response.status}`);
  const modelsBody = (await response.json()) as { data?: unknown };
  if (!Array.isArray(modelsBody.data)) {
    throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog returned an invalid data list');
  }
  const ids = modelsBody.data
    .map((model) => (model && typeof model === 'object' && typeof (model as { id?: unknown }).id === 'string'
      ? (model as { id: string }).id
      : null))
    .filter((id): id is string => id !== null);
  if (ids.length === 0 && !target.strictResponders) {
    throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog returned no models');
  }
  return target.exactModelIds ? ids.filter(id => target.exactModelIds!.includes(id)) : ids;
}

async function probeModels(
  target: ProviderRefreshTarget,
  ids: readonly string[],
  timeoutMs: number,
): Promise<CatalogModel[]> {
  if (target.probeModels === false && !target.strictResponders) {
    return ids.map((id) => ({ id, responds: true, latencyMs: null, lastSeen: nowSeconds() }));
  }
  return Promise.all(ids.map(async (id) => {
    const started = Date.now();
    let responds = false;
    let latencyMs: number | null = null;
    let failureKind: CatalogModel['failureKind'];
    let statusCode: number | undefined;
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
      statusCode = res.status;
      responds = res.status === 200;
      if (!responds) failureKind = 'http';
      try {
        await res.body?.cancel();
      } catch {
        // The received HTTP status is authoritative even if body cleanup races
        // a connection close; do not relabel an HTTP 400/500 as transport loss.
      }
    } catch {
      responds = false;
      latencyMs = null;
      failureKind = 'transport';
    }
    return {
      id,
      responds,
      latencyMs,
      lastSeen: nowSeconds(),
      ...(failureKind === undefined ? {} : { failureKind }),
      ...(statusCode === undefined ? {} : { statusCode }),
    };
  }));
}

function readLastKnownGoodByProvider(userDataDir: string): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(userDataDir, CATALOG_FILE), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return {};
    const record = parsed as { lastKnownGoodByProvider?: unknown; providers?: unknown };
    if (record.lastKnownGoodByProvider && typeof record.lastKnownGoodByProvider === 'object') {
      return Object.fromEntries(Object.entries(record.lastKnownGoodByProvider as Record<string, unknown>)
        .filter((entry): entry is [string, string[]] => Array.isArray(entry[1])
          && entry[1].every((id) => typeof id === 'string')));
    }
    // Migrate catalogs created before the explicit last-known-good set existed.
    if (!record.providers || typeof record.providers !== 'object') return {};
    return Object.fromEntries(Object.entries(record.providers as Record<string, unknown>).map(([provider, value]) => {
      const models = value && typeof value === 'object'
        ? (value as { models?: unknown }).models
        : undefined;
      const ids = Array.isArray(models)
        ? models.flatMap((model) => model && typeof model === 'object'
          && (model as { responds?: unknown }).responds === true
          && typeof (model as { id?: unknown }).id === 'string'
          ? [(model as { id: string }).id]
          : [])
        : [];
      return [provider, ids];
    }));
  } catch {
    return {};
  }
}

/**
 * Best-effort read of the gateway-advertised per-model `reasoning` flags.
 * The opencode2api gateway persists its served-model metadata next to its
 * config (`<userDataDir>/opencode2api/config.json.models.catalog.json`,
 * `metadata.zen` / `metadata.go` maps). Absent/unparseable files yield null
 * and the name-only policy applies. Never throws.
 */
export function loadGatewayReasoningFlags(userDataDir: string): Map<string, boolean> | null {
  try {
    const raw = readFileSync(join(userDataDir, 'opencode2api', 'config.json.models.catalog.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const metadata = (parsed as { metadata?: unknown }).metadata;
    if (!metadata || typeof metadata !== 'object') return null;
    const out = new Map<string, boolean>();
    for (const lane of Object.values(metadata as Record<string, unknown>)) {
      if (!lane || typeof lane !== 'object') continue;
      for (const [id, info] of Object.entries(lane as Record<string, unknown>)) {
        if (info && typeof info === 'object' && (info as { reasoning?: unknown }).reasoning === true) {
          out.set(id, true);
        }
      }
    }
    return out;
  } catch {
    return null;
  }
}

function syncProviderModels(
  providers: Record<string, Record<string, any>>,
  target: ProviderRefreshTarget,
  entries: CatalogModel[],
  reasoningHints: Map<string, boolean> | null = null,
): void {
  const provider = providers[target.provider] ?? (providers[target.provider] = {
    api: 'openai-completions',
    baseURL: providerBaseUrl(target.baseUrl),
    ...(target.provider === FREE_PROVIDER || target.apiKeyEnv
      ? { apiKeyEnv: target.provider === FREE_PROVIDER ? 'FREECODE_PUBLIC_KEY' : target.apiKeyEnv }
      : {}),
    defaultInput: target.defaultInput
      ?? (target.provider === FREE_PROVIDER ? ['text'] : ['text', 'image']),
    models: [],
  });
  if (target.apiKeyEnv !== undefined && provider.apiKeyEnv !== target.apiKeyEnv) {
    provider.apiKeyEnv = target.apiKeyEnv;
  }
  if (target.refreshBaseUrl) provider.baseURL = providerBaseUrl(target.baseUrl);
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
  const lastKnownGood = entries.filter((model) => model.lastKnownGood === true);
  const advertisedFallbacks = target.strictResponders ? [] : entries.filter((model) => target.alwaysExposedModels?.has(model.id));
  if (responders.length > 0) {
    const responderIds = new Set(responders.map((model) => model.id));
    provider.models = [
      ...responders,
      ...lastKnownGood.filter((model) => !responderIds.has(model.id)),
      ...advertisedFallbacks.filter((model) => !responderIds.has(model.id)),
    ]
      .map((model) => modelSettingsForModel(model.id, reasoningHints?.get(model.id)));
    return;
  }

  // A strict lane never exposes a newly advertised/unverified model. Preserve
  // only prior HTTP-200 routes when this refresh ended in a transport failure;
  // explicit HTTP rejections (including unsupported-protocol 400) are dropped.
  if (target.strictResponders) {
    provider.models = lastKnownGood.map((model) => modelSettingsForModel(model.id, reasoningHints?.get(model.id)));
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
      return modelSettingsForModel(id, reasoningHints?.get(id));
    });
  const fallbackAdvertised = advertisedFallbacks
    .filter((model) => !appendedIds.has(model.id))
    .map((model) => {
      appendedIds.add(model.id);
      return modelSettingsForModel(model.id, reasoningHints?.get(model.id));
    });
  if (fallbackEntries.length > 0 || fallbackAdvertised.length > 0) {
    provider.models = [...current, ...fallbackEntries, ...fallbackAdvertised];
  }
}

function modelSettingsForModel(id: string, gatewayReasoning?: boolean): {
  id: string;
  reasoningEfforts: ReturnType<typeof reasoningEffortsForModelWithHint>;
  compat?: { thinkingFormat: 'deepseek'; supportsReasoningEffort: false };
} {
  const compat = compatForModel(id);
  return {
    id,
    reasoningEfforts: reasoningEffortsForModelWithHint(id, gatewayReasoning),
    ...(compat === undefined ? {} : { compat }),
  };
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
  const yaml = dumpYaml(settings, { noRefs: true, lineWidth: 120 });
  // Atomic write: tmp + rename to prevent corruption on crash.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, yaml, 'utf8');
  renameSync(tmp, path);
}
