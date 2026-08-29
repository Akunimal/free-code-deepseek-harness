import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { isDeepSeekModel, reasoningEffortsForModel } from './reasoning-policy.js';
import type { ModelReasoningEfforts } from './reasoning-policy.js';
import {
  DEFAULT_GEMINI_WEB2API_PORT,
  GEMINI_WEB_DISPLAY_NAME,
  GEMINI_WEB_FALLBACK_MODELS,
  GEMINI_WEB_PROVIDER,
  DEFAULT_PERPLEXITY_API_PORT,
  PERPLEXITY_FREE_DISPLAY_NAME,
  PERPLEXITY_FREE_FALLBACK_MODELS,
  PERPLEXITY_FREE_PROVIDER,
} from './local-provider-config.js';

/**
 * Provider seeder — runs ONCE the harness-supervisor reports ready.
 * Idempotent merge into $DSH_HOME/settings.yaml.
 *
 * Upstream contract (verified against deepseek-harness master, llm-pi-ai):
 *   - The settings user layer lives at `<harness home>/settings.yaml` and
 *     carries per-namespace sections. The `llm-pi-ai:` section schema is
 *     `{ providers: { <route>: <profile> } }` — there is NO `defaultProvider`
 *     key (it is rejected by the namespace validator).
 *   - A hand-declared route needs `api`, `baseURL`, and a NON-EMPTY `models`
 *     list of `{id,...}` entries, otherwise the section is refused
 *     (`settings-rejected`) and the provider never registers. `models: []`
 *     is NOT serviceable — the seeder must plant at least one known model;
 *     the model-refresher then syncs the full latency-sorted list.
 *   - Only the OpenCode Free pool is seeded; OmniRoute stays out of the seed
 *     (the user adds it via the on-demand wizard).
 */

export interface SeederConfig {
  homeDir: string; // DSH_HOME
  lbBaseUrl: string; // http://127.0.0.1:<PUERTO_LB>/v1
  apiKeyEnv?: string; // default FREECODE_PUBLIC_KEY
  geminiBaseUrl?: string; // http://127.0.0.1:<port>
  perplexityBaseUrl?: string; // http://127.0.0.1:<port>
}

interface ProviderEntry {
  displayName?: string;
  api: string;
  baseURL: string;
  apiKeyEnv?: string;
  defaultInput?: string[];
  models?: unknown[];
  compat?: Record<string, string>;
  reasoning?: string;
}

interface SettingsShape {
  'llm-pi-ai'?: {
    providers?: Record<string, ProviderEntry>;
  };
  [key: string]: unknown;
}

const DEFAULT_PROVIDER = 'deepseek-free';
const DEFAULT_API_KEY_ENV = 'FREECODE_PUBLIC_KEY';
const FREE_PROVIDER_DISPLAY_NAME = 'OpenCode Free Pool';
const LEGACY_FREE_PROVIDER_DISPLAY_NAMES = new Set([
  'DeepSeek Free (pool)',
  'DeepSeek Free Pool',
]);
/** Seed model — the model-refresher replaces this with the live catalog. */
const FALLBACK_MODELS = [{ id: 'x-preview-f', reasoningEfforts: reasoningEffortsForModel('x-preview-f') }];
const DEFAULT_GEMINI_BASE_URL = `http://127.0.0.1:${DEFAULT_GEMINI_WEB2API_PORT}`;
const MARKER_FILE = '.freecode-seeded-v1';

export function seedProviders(cfg: SeederConfig): { seeded: boolean; path: string } {
  const settingsPath = join(cfg.homeDir, 'settings.yaml');
  const settings: SettingsShape = readSettings(settingsPath);

  const section = settings['llm-pi-ai'] ?? (settings['llm-pi-ai'] = {});
  const providers = section.providers ?? (section.providers = {});

  const existing = providers[DEFAULT_PROVIDER];
  let seeded = false;
  if (existing) {
    // Migrate the label written by older releases. Keep unrelated user edits,
    // but never leave the built-in OpenCode Free pool under the old name.
    if (!existing.displayName || LEGACY_FREE_PROVIDER_DISPLAY_NAMES.has(existing.displayName)) {
      if (existing.displayName !== FREE_PROVIDER_DISPLAY_NAME) {
        existing.displayName = FREE_PROVIDER_DISPLAY_NAME;
        seeded = true;
      }
    }
    if (existing.baseURL !== cfg.lbBaseUrl) {
      existing.baseURL = cfg.lbBaseUrl;
      seeded = true;
    }
    if (Array.isArray(existing.models) && existing.models.length === 0) {
      existing.models = cloneFallbackModels();
      seeded = true;
    }
    if (existing.reasoning !== undefined) {
      // Older shell releases put a route-wide effort here. The pool is
      // heterogeneous, so that value is unsafe for every non-DeepSeek model.
      delete existing.reasoning;
      seeded = true;
    }
    if (Array.isArray(existing.models)) {
      const normalized = normalizeModelEntries(existing.models);
      if (normalized.some((entry, index) => entry !== existing.models![index])) {
        existing.models = normalized;
        seeded = true;
      }
    }
  } else {
    providers[DEFAULT_PROVIDER] = {
      displayName: FREE_PROVIDER_DISPLAY_NAME,
      api: 'openai-completions',
      baseURL: cfg.lbBaseUrl,
      apiKeyEnv: cfg.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
      defaultInput: ['text'],
      models: cloneFallbackModels(),
      compat: { thinkingFormat: 'deepseek' },
      // NOTE: reasoning removed — the pool is heterogeneous; model-refresher
      // sets reasoningEfforts per model.
    };
    seeded = true;
  }

  // Gemini Web2API is an optional local route. It is seeded alongside the
  // built-in pool, but never selected as the default model. This keeps the
  // provider visible and schema-valid even while its Python process is still
  // starting or unavailable on a machine without Python.
  const geminiProvider = providers[GEMINI_WEB_PROVIDER];
  const geminiBaseUrl = `${cfg.geminiBaseUrl ?? DEFAULT_GEMINI_BASE_URL}/v1`;
  if (!geminiProvider) {
    providers[GEMINI_WEB_PROVIDER] = {
      displayName: GEMINI_WEB_DISPLAY_NAME,
      api: 'openai-completions',
      baseURL: geminiBaseUrl,
      defaultInput: ['text', 'image'],
      models: cloneGeminiFallbackModels(),
    };
    seeded = true;
  } else {
    if (!geminiProvider.displayName) {
      geminiProvider.displayName = GEMINI_WEB_DISPLAY_NAME;
      seeded = true;
    }
    if (!geminiProvider.api) {
      geminiProvider.api = 'openai-completions';
      seeded = true;
    }
    if (!geminiProvider.baseURL) {
      geminiProvider.baseURL = geminiBaseUrl;
      seeded = true;
    }
    if (!Array.isArray(geminiProvider.models) || geminiProvider.models.length === 0) {
      geminiProvider.models = cloneGeminiFallbackModels();
      seeded = true;
    }
  }

  // Perplexity-AI-API is another optional local OpenAI-compatible route. Its
  // upstream server works anonymously for basic text queries; a cookie is
  // only needed for authenticated/Pro features. The desktop does not make
  // this native Linux helper a hard dependency, but keeps the route visible
  // and schema-valid so it appears in the same model selector after Gemini.
  const perplexityProvider = providers[PERPLEXITY_FREE_PROVIDER];
  const perplexityBaseUrl = `${cfg.perplexityBaseUrl ?? `http://127.0.0.1:${DEFAULT_PERPLEXITY_API_PORT}`}/v1`;
  if (!perplexityProvider) {
    providers[PERPLEXITY_FREE_PROVIDER] = {
      displayName: PERPLEXITY_FREE_DISPLAY_NAME,
      api: 'openai-completions',
      baseURL: perplexityBaseUrl,
      defaultInput: ['text', 'image'],
      models: clonePerplexityFallbackModels(),
    };
    seeded = true;
  } else {
    if (!perplexityProvider.displayName) {
      perplexityProvider.displayName = PERPLEXITY_FREE_DISPLAY_NAME;
      seeded = true;
    }
    if (!perplexityProvider.api) {
      perplexityProvider.api = 'openai-completions';
      seeded = true;
    }
    if (!perplexityProvider.baseURL) {
      perplexityProvider.baseURL = perplexityBaseUrl;
      seeded = true;
    }
    if (!Array.isArray(perplexityProvider.models) || perplexityProvider.models.length === 0) {
      perplexityProvider.models = clonePerplexityFallbackModels();
      seeded = true;
    }
  }

  // Ensure agent-default-model points to deepseek-free with a model that
  // the pool actually serves. If missing or pointing to a provider with no
  // API key configured (e.g. the built-in deepseek-official on a fresh
  // install), correct it to the free pool route.
  const defaultModel = settings['agent-default-model'] as
    | { provider?: string; model?: string; reasoningEffort?: string }
    | undefined;
  const freeModels = Array.isArray(providers[DEFAULT_PROVIDER]?.models)
    ? providers[DEFAULT_PROVIDER]!.models as { id?: unknown }[]
    : [];
  const firstModel = freeModels.find((entry) => typeof entry?.id === 'string')?.id as string
    | undefined ?? FALLBACK_MODELS[0]!.id;
  if (!defaultModel || defaultModel.provider !== DEFAULT_PROVIDER) {
    settings['agent-default-model'] = {
      provider: DEFAULT_PROVIDER,
      model: firstModel,
    };
    seeded = true;
  } else if (
    defaultModel.reasoningEffort !== undefined
    && !isDeepSeekModel(defaultModel.model)
  ) {
    const { reasoningEffort: _staleEffort, ...withoutStaleEffort } = defaultModel;
    settings['agent-default-model'] = withoutStaleEffort;
    seeded = true;
  }

  if (seeded) {
    writeSettings(settingsPath, settings);
    if (!existing) writeMarker(cfg.homeDir, cfg.lbBaseUrl);
  }
  return { seeded, path: settingsPath };
}

function cloneFallbackModels(): { id: string; reasoningEfforts: ModelReasoningEfforts }[] {
  return FALLBACK_MODELS.map((model) => ({ ...model }));
}

function cloneGeminiFallbackModels(): { id: string; reasoningEfforts: ModelReasoningEfforts }[] {
  return GEMINI_WEB_FALLBACK_MODELS.map((id) => ({
    id,
    reasoningEfforts: reasoningEffortsForModel(id),
  }));
}

function clonePerplexityFallbackModels(): { id: string; reasoningEfforts: ModelReasoningEfforts }[] {
  return PERPLEXITY_FREE_FALLBACK_MODELS.map((id) => ({
    id,
    reasoningEfforts: reasoningEffortsForModel(id),
  }));
}

function normalizeModelEntries(models: unknown[]): unknown[] {
  return models.map((model) => {
    if (model === null || typeof model !== 'object' || Array.isArray(model)) return model;
    const entry = model as { id?: unknown; reasoningEfforts?: unknown };
    if (typeof entry.id !== 'string') return model;
    const desired = reasoningEffortsForModel(entry.id);
    return JSON.stringify(entry.reasoningEfforts) === JSON.stringify(desired)
      ? model
      : { ...entry, reasoningEfforts: desired };
  });
}

function readSettings(path: string): SettingsShape {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  if (!raw.trim()) return {};
  const parsed = loadYaml(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as SettingsShape;
}

function writeSettings(path: string, settings: SettingsShape): void {
  mkdirSync(dirname(path), { recursive: true });
  const yaml = dumpYaml(settings, { noRefs: true, lineWidth: 120 });
  // Atomic write: tmp + rename.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, yaml, 'utf8');
  renameSync(tmp, path);
}

function writeMarker(homeDir: string, lbBaseUrl: string): void {
  try {
    writeFileSync(
      join(homeDir, MARKER_FILE),
      JSON.stringify({ version: 3, seededAt: Date.now(), lbBaseUrl }),
      'utf8',
    );
  } catch {
    /* marker is advisory; seeding already succeeded */
  }
}
