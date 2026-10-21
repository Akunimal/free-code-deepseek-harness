import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  compatForModel,
  reasoningEffortsForModelWithHint,
  type ModelReasoningEfforts,
  type ModelReasoningLevel,
} from './reasoning-policy.js';
import { readHarnessSettings, writeHarnessSettings } from './harness-settings.js';

/**
 * Model refresher — probes OpenAI-compatible provider routes, persists a
 * catalog, and syncs responding models into the active web profile. The
 * packaged Phoenix catalog is the required primary route; optional local
 * providers can be refreshed without making the whole refresh fail.
 */

export interface CatalogModel {
  id: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoning?: boolean;
  reasoningEfforts?: ModelReasoningEfforts;
  defaultReasoningEffort?: ModelReasoningLevel;
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
  /** Optional selector group label. */
  displayName?: string;
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
  const models = catalog.providers['freecode-phoenix']?.models ?? [];
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
  homeDir: string; // DSH_HOME (profiles/web/cordis.patch.yml is watched by DSH)
  userDataDir: string; // model-catalog.json lives here
  authHeader?: string; // e.g. 'Bearer public'
  /** Managed gateway settings key; defaults to Phoenix. */
  provider?: string;
  /** Canonical shipped catalog; excludes router aliases from selector results. */
  exactModelIds?: readonly string[];
  /** Do not send per-model requests to upstream services during discovery. */
  probeModels?: boolean;
  /** Environment variable holding the managed gateway's local API key. */
  apiKeyEnv?: string;
  providers?: readonly ProviderRefreshTarget[];
  probeTimeoutMs?: number; // default 120000; free models can take >60s to answer
  onUpdate?: (catalog: ModelCatalog) => void;
}

const CATALOG_FILE = 'model-catalog.json';
// x-preview-f has been observed taking about a minute on a cold/upstream path.
// A short probe timeout makes a healthy, advertised model disappear from the
// user's selector while an in-flight request is still viable.
const PROBE_TIMEOUT_MS = 120_000;
const FREE_PROVIDER = 'freecode-phoenix';

/** Free models preferred as the out-of-the-box default, first match wins.
 *  Only applied when the model actually responds this refresh. */
export const PREFERRED_DEFAULT_MODELS: readonly string[] = ['auto'];
const REASONING_LEVELS = new Set<ModelReasoningLevel>(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const DEEPSEEK_V4_CAPABILITIES: ListedModel = {
  id: '',
  contextWindow: 1_048_576,
  maxOutputTokens: 393_216,
  reasoning: true,
  reasoningEfforts: { off: null, low: 'low', high: 'high', max: 'max' },
  // No defaultReasoningEffort: unless the gateway declares one, no effort is
  // sent and the model answers with its own default. The user can still pick
  // any level the model allows in the selector.
};

interface ListedModel {
  id: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoning?: boolean;
  reasoningEfforts?: ModelReasoningEfforts;
  defaultReasoningEffort?: ModelReasoningLevel;
}

export async function refreshModels(cfg: RefresherConfig): Promise<ModelCatalog> {
  const timeoutMs = cfg.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
  const previousLastKnownGood = readLastKnownGoodByProvider(cfg.userDataDir);
  const primaryProvider = cfg.provider ?? FREE_PROVIDER;
  const targets: ProviderRefreshTarget[] = [
    {
      provider: primaryProvider,
      displayName: 'Phoenix',
      baseUrl: cfg.lbBaseUrl,
      authHeader: cfg.authHeader,
      exactModelIds: cfg.exactModelIds,
      probeModels: cfg.probeModels,
      apiKeyEnv: cfg.apiKeyEnv ?? 'FREECODE_PHOENIX_API_KEY',
      defaultInput: ['text'],
      // Phoenix's pinned manifest is the selector contract. Per-model probes
      // would be slow, rate-limited and incorrectly imply live guarantees.
      strictResponders: cfg.probeModels !== false,
      fallbackModels: cfg.probeModels === false ? cfg.exactModelIds : undefined,
      refreshBaseUrl: true,
    },
    ...(cfg.providers ?? []).filter((target) => target.provider !== primaryProvider),
  ];

  // Discover candidates first, but do not make them routable in DSH settings
  // until the strict lane has completed its bounded probes. The selector and
  // Host both consume settings.yaml; publishing candidates here would let an
  // unverified or protocol-rejected route slip through while a slow probe is
  // still running. A slow model may take up to two minutes, so keep the UI in
  // its explicit "checking"/blocked state until the 200-only result is ready.
  const listings = await Promise.all(targets.map(async (target, index) => {
    if (index === 0 && cfg.primaryUnavailable) return { target, ids: [] as ListedModel[] };
    try {
      const listed = await listModelIds(target, timeoutMs);
      return {
        target,
        ids: listed,
      };
    } catch (error) {
      // The required primary catalog keeps its historical failure contract.
      // An optional provider can be offline without failing the primary list.
      if (index === 0) throw error;
      return { target, ids: [] as ListedModel[], listFailed: true as const };
    }
  }));

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

  // Sync all configured targets in one active-profile edit so user sections and
  // custom provider fields survive the refresh.
  const settings = readHarnessSettings(cfg.homeDir);
  const section = settings['llm-pi-ai'] ?? (settings['llm-pi-ai'] = {});
  const providers = section.providers ?? (section.providers = {});
  for (const { target, entries } of results) {
    syncProviderModels(providers, target, entries);
  }
  const responders = results.find(({ target }) => target.provider === primaryProvider)?.entries
    .filter(model => model.responds).map(model => model.id) ?? [];
  // Start with Auto Phoenix when available; otherwise use the first responder.
  const preferredDefault = responders.find(id => PREFERRED_DEFAULT_MODELS.includes(id)) ?? responders[0];
  const defaultModel = settings['agent-default-model'] as { provider?: unknown; model?: unknown } | undefined;
  const hasValidDefault = typeof defaultModel?.provider === 'string' && typeof defaultModel.model === 'string';
  if (preferredDefault !== undefined && (!hasValidDefault
    || (defaultModel.provider === primaryProvider && !responders.includes(defaultModel.model as string)))) {
    // New Sessions get a verified route after migration or when their old
    // selection is no longer served. Existing Session history stays intact.
    settings['agent-default-model'] = { provider: primaryProvider, model: preferredDefault };
  }
  writeHarnessSettings(cfg.homeDir, settings);

  cfg.onUpdate?.(catalog);
  return catalog;
}

async function listModelIds(target: ProviderRefreshTarget, timeoutMs: number): Promise<ListedModel[]> {
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
  const modelsBody: unknown = await response.json();
  const data = asRecord(modelsBody)?.data;
  if (!Array.isArray(data)) {
    throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog returned an invalid data list');
  }
  const models = data.flatMap((item): ListedModel[] => {
    const record = asRecord(item);
    if (record === undefined) return [];
    const id = record.id;
    if (typeof id !== 'string' || id.trim().length === 0) return [];
    const metadata = asRecord(record.metadata);
    const compat = asRecord(record.compat);
    const efforts = parseReasoningEfforts(
      record.reasoning_efforts,
      metadata?.reasoning_efforts,
      compat?.supportedReasoningEfforts,
    );
    const reasoning = typeof record.reasoning === 'boolean'
      ? record.reasoning
      : typeof metadata?.reasoning === 'boolean' ? metadata.reasoning : undefined;
    const defaultEffort = parseReasoningLevel(
      record.default_reasoning_effort,
      metadata?.default_reasoning_effort,
      compat?.defaultReasoningEffort,
    );
    const contextWindow = positiveSafeInteger(
      record.context_window,
      record.context_length,
      metadata?.context_window,
      metadata?.context_length,
    );
    const maxOutputTokens = positiveSafeInteger(
      record.max_output,
      record.max_output_tokens,
      metadata?.max_output,
      metadata?.max_output_tokens,
    );
    return [{
      id,
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      ...(reasoning === undefined ? {} : { reasoning }),
      ...(efforts === undefined ? {} : { reasoningEfforts: efforts }),
      ...(defaultEffort === undefined ? {} : { defaultReasoningEffort: defaultEffort }),
    }];
  });
  if (models.length === 0 && !target.strictResponders) {
    throw new ModelRefreshError('CATALOG_UNAVAILABLE', 'models catalog returned no models');
  }
  if (!target.exactModelIds) return models;

  const qualityOrder = new Map(target.exactModelIds.map((id, index) => [id, index]));
  const allowed = models
    .filter(model => qualityOrder.has(model.id))
    .sort((a, b) => (qualityOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER)
      - (qualityOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  // `auto` is a Phoenix router mode, not an upstream model. FreeLLMpool's
  // OpenAI `/models` endpoint correctly lists only concrete provider/model
  // routes, so synthesize this one selector entry from our packaged quality
  // order and keep it first after every refresh.
  if (target.exactModelIds[0] === 'auto') {
    const auto = allowed.find(model => model.id === 'auto') ?? { id: 'auto' };
    return [auto, ...allowed.filter(model => model.id !== 'auto')];
  }
  return allowed;
}

async function probeModels(
  target: ProviderRefreshTarget,
  ids: readonly ListedModel[],
  timeoutMs: number,
): Promise<CatalogModel[]> {
  if (target.probeModels === false && !target.strictResponders) {
    return ids.map(model => ({
      ...mergeModelCapabilities(model),
      responds: true,
      latencyMs: null,
      lastSeen: nowSeconds(),
    }));
  }
  return Promise.all(ids.map(async (model) => {
    const { id } = model;
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
          // Muse Spark rejects output budgets below 16. The probe only needs
          // one short response, but its request must satisfy that upstream
          // minimum or a healthy model is falsely marked unavailable.
          max_tokens: 16,
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
      ...mergeModelCapabilities(model),
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function positiveSafeInteger(...values: unknown[]): number | undefined {
  return values.find((value): value is number => Number.isSafeInteger(value) && (value as number) > 0);
}

function parseReasoningLevel(...values: unknown[]): ModelReasoningLevel | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const level = value.trim().toLowerCase() as ModelReasoningLevel;
    if (REASONING_LEVELS.has(level)) return level;
  }
  return undefined;
}

function parseReasoningEfforts(...values: unknown[]): ModelReasoningEfforts | undefined {
  const declared = values.find(Array.isArray);
  if (!Array.isArray(declared)) return undefined;
  const levels = new Set<ModelReasoningLevel>();
  for (const value of declared) {
    const level = parseReasoningLevel(value);
    if (level !== undefined) levels.add(level);
  }
  if (levels.size === 0) return false;
  return {
    off: null,
    ...Object.fromEntries([...levels].map(level => [level, level])),
  } as ModelReasoningEfforts;
}

function mergeModelCapabilities(model: ListedModel, cached?: ListedModel): ListedModel {
  const explicitNonReasoning = model.reasoning === false || cached?.reasoning === false;
  const useDeepSeekV4Defaults = isDeepSeekV4Model(model.id) && !explicitNonReasoning;
  const fallback = useDeepSeekV4Defaults ? DEEPSEEK_V4_CAPABILITIES : undefined;
  const contextWindow = model.contextWindow ?? cached?.contextWindow ?? fallback?.contextWindow;
  const maxOutputTokens = model.maxOutputTokens ?? cached?.maxOutputTokens ?? fallback?.maxOutputTokens;
  const reasoning = model.reasoning ?? cached?.reasoning ?? fallback?.reasoning;
  const reasoningEfforts = model.reasoningEfforts ?? cached?.reasoningEfforts ?? fallback?.reasoningEfforts;
  const defaultReasoningEffort = model.defaultReasoningEffort
    ?? cached?.defaultReasoningEffort
    ?? fallback?.defaultReasoningEffort;
  return {
    id: model.id,
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(reasoningEfforts === undefined ? {} : { reasoningEfforts }),
    ...(defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort }),
  };
}

function isDeepSeekV4Model(id: string): boolean {
  return /^deepseek-v4(?:[.-]|$)/i.test(id);
}

function syncProviderModels(
  providers: Record<string, Record<string, any>>,
  target: ProviderRefreshTarget,
  entries: CatalogModel[],
): void {
  const provider = providers[target.provider] ?? (providers[target.provider] = {
    ...(target.displayName ? { displayName: target.displayName } : {}),
    api: 'openai-completions',
    baseURL: providerBaseUrl(target.baseUrl),
    ...(target.apiKeyEnv
      ? { apiKeyEnv: target.apiKeyEnv }
      : {}),
    defaultInput: target.defaultInput
      ?? ['text', 'image'],
    models: [],
  });
  if (target.apiKeyEnv !== undefined && provider.apiKeyEnv !== target.apiKeyEnv) {
    provider.apiKeyEnv = target.apiKeyEnv;
  }
  if (target.refreshBaseUrl) provider.baseURL = providerBaseUrl(target.baseUrl);
  // For Phoenix, exactModelIds is the source-controlled capability-quality
  // order generated from the pinned benchmark table (and Kilo's documented
  // usage-rank fallback). Never let a fast but lower-ranked probe leapfrog a
  // better model in the selector. Other custom providers retain latency order.
  const qualityOrder = target.exactModelIds === undefined
    ? undefined
    : new Map(target.exactModelIds.map((id, index) => [id, index]));
  const compareModels = (a: CatalogModel, b: CatalogModel): number => {
    if (qualityOrder !== undefined) {
      const aRank = qualityOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = qualityOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank < bRank ? -1 : 1;
    }
    const aLatency = a.latencyMs ?? Infinity;
    const bLatency = b.latencyMs ?? Infinity;
    // Date.now() has millisecond resolution; treating a one-millisecond
    // difference as meaningful would make latency-only lanes depend on
    // event-loop scheduling for equally fast responses.
    if (Math.abs(aLatency - bLatency) <= 1) return 0;
    return aLatency - bLatency;
  };
  const responders = entries
    .filter((model) => model.responds)
    .sort(compareModels);
  const lastKnownGood = entries.filter((model) => model.lastKnownGood === true);
  const advertisedFallbacks = target.strictResponders ? [] : entries.filter((model) => target.alwaysExposedModels?.has(model.id));
  if (responders.length > 0) {
    const responderIds = new Set(responders.map((model) => model.id));
    const visible = [
      ...responders,
      ...lastKnownGood.filter((model) => !responderIds.has(model.id)),
      ...advertisedFallbacks.filter((model) => !responderIds.has(model.id)),
    ];
    if (qualityOrder !== undefined) visible.sort(compareModels);
    provider.models = visible.map(model => modelSettingsForModel(model));
    return;
  }

  // A strict lane never exposes a newly advertised/unverified model. Preserve
  // only prior HTTP-200 routes when this refresh ended in a transport failure;
  // explicit HTTP rejections (including unsupported-protocol 400) are dropped.
  if (target.strictResponders) {
    provider.models = lastKnownGood.map(model => modelSettingsForModel(model));
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
      return modelSettingsForModel(mergeModelCapabilities({ id }));
    });
  const fallbackAdvertised = advertisedFallbacks
    .filter((model) => !appendedIds.has(model.id))
    .map((model) => {
      appendedIds.add(model.id);
      return modelSettingsForModel(model);
    });
  if (fallbackEntries.length > 0 || fallbackAdvertised.length > 0) {
    provider.models = [...current, ...fallbackEntries, ...fallbackAdvertised];
  }
}

function modelSettingsForModel(model: ListedModel): {
  id: string;
  contextWindow?: number;
  outputMaxTokens?: number;
  reasoningEfforts: ModelReasoningEfforts;
  defaultReasoningEffort?: ModelReasoningLevel;
  compat?: { thinkingFormat: 'deepseek'; supportsReasoningEffort: false };
} {
  const compat = compatForModel(model.id);
  const reasoningEfforts = model.reasoning === false
    ? false
    : model.reasoningEfforts ?? reasoningEffortsForModelWithHint(model.id, model.reasoning);
  const defaultReasoningEffort = model.defaultReasoningEffort !== undefined
    && reasoningEfforts !== false
    && Object.prototype.hasOwnProperty.call(reasoningEfforts, model.defaultReasoningEffort)
    ? model.defaultReasoningEffort
    : undefined;
  return {
    id: model.id,
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.maxOutputTokens === undefined ? {} : { outputMaxTokens: model.maxOutputTokens }),
    reasoningEfforts,
    ...(defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort }),
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
