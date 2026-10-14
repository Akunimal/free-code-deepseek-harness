import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';
import { compatForModel, isDeepSeekModel } from './reasoning-policy.js';

/**
 * Provider seeder — runs ONCE the harness-supervisor reports ready.
 * Idempotent merge into $DSH_HOME/settings.yaml.
 *
 * Upstream contract (verified against deepseek-harness master, llm-pi-ai):
 *   - The settings user layer lives at `<harness home>/settings.yaml` and
 *     carries per-namespace sections. The `llm-pi-ai:` section schema is
 *     `{ providers: { <route>: <profile> } }` — there is NO `defaultProvider`
 *     key (it is rejected by the namespace validator).
 *   - A hand-declared route needs a NON-EMPTY `models` list to register. The
 *     seeder deliberately leaves the built-in route empty until the gateway's
 *     live `/models` catalog has been probed; model-refresher only publishes
 *     IDs after HTTP 200 responder checks. A synthetic seed can expose a
 *     model the gateway cannot route.
 *   - Only the OpenCode Free pool is seeded; unrelated user routes remain user-owned.
 */

export interface SeederConfig {
  homeDir: string; // DSH_HOME
  lbBaseUrl: string; // http://127.0.0.1:<PUERTO_LB>/v1
  apiKeyEnv?: string; // default FREECODE_PUBLIC_KEY
}

interface ProviderEntry {
  displayName?: string;
  api: string;
  baseURL: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  defaultInput?: string[];
  models?: unknown[];
  // Compat values include booleans such as supportsReasoningEffort; keep the
  // user-layer type honest instead of pretending every override is a string.
  compat?: Record<string, unknown>;
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
const FREE_PROVIDER_DISPLAY_NAME = 'OpenCode Free';
const LEGACY_FREE_PROVIDER_DISPLAY_NAMES = new Set([
  'DeepSeek Free (pool)',
  'DeepSeek Free Pool',
  'OpenCode Free Pool',
  'FreeLLMPool',
]);
/** Removed duplicate lane — `opencode-free` pointed at the same opencode2api
 *  gateway as `deepseek-free` and doubled every model in the selector.
 *  Only the app-managed duplicate (displayName `OpenCode No-Auth`) is removed;
 *  a user-owned provider reusing the key stays untouched. */
const OPENCODE_PROVIDER = 'opencode-free';
const OPENCODE_DISPLAY_NAME = 'OpenCode No-Auth';
const LEGACY_PERPLEXITY_PROVIDER = 'perplexity-free';
const LEGACY_PERPLEXITY_DISPLAY_NAME = 'Perplexity Free (local)';
const REMOVED_GEMINI_PROVIDER = 'gemini-web';
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
    // Never keep old IDs or synthesize a route at startup. The gateway's live
    // /models response is authoritative and will repopulate this list shortly.
    if (!Array.isArray(existing.models) || existing.models.length > 0) {
      existing.models = [];
      seeded = true;
    }
    if (existing.reasoning !== undefined) {
      // Older shell releases put a route-wide effort here. The pool is
      // heterogeneous, so that value is unsafe for every non-DeepSeek model.
      delete existing.reasoning;
      seeded = true;
    }
  } else {
    providers[DEFAULT_PROVIDER] = {
      displayName: FREE_PROVIDER_DISPLAY_NAME,
      api: 'openai-completions',
      baseURL: cfg.lbBaseUrl,
      apiKeyEnv: cfg.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
      defaultInput: ['text'],
      models: [],
      compat: { thinkingFormat: 'deepseek' },
      // NOTE: reasoning removed — the pool is heterogeneous; model-refresher
      // sets reasoningEfforts per model.
    };
    seeded = true;
  }

  // Remove the provider seeded by the short-lived 0.3.1 Perplexity build.
  // Only remove the exact app-managed entry; an unrelated user provider with
  // another display name remains untouched.
  const legacyPerplexity = providers[LEGACY_PERPLEXITY_PROVIDER];
  if (legacyPerplexity?.displayName === LEGACY_PERPLEXITY_DISPLAY_NAME) {
    delete providers[LEGACY_PERPLEXITY_PROVIDER];
    seeded = true;
  }

  // Gemini Web2API was a FreeCode-managed route in older releases. Remove
  // only that exact route during migration; unrelated user providers remain
  // untouched. Historical sessions still retain their messages because this
  // migration only changes the live provider catalog.
  if (providers[REMOVED_GEMINI_PROVIDER] !== undefined) {
    delete providers[REMOVED_GEMINI_PROVIDER];
    seeded = true;
  }

  // Drop the consolidated opencode-free duplicate lane so each gateway model
  // appears exactly once in the selector, under deepseek-free.
  if (providers[OPENCODE_PROVIDER]?.displayName === OPENCODE_DISPLAY_NAME) {
    delete providers[OPENCODE_PROVIDER];
    seeded = true;
  }

  // Keep the durable default while the strict model catalog is empty. The
  // Host revalidates it before prompt admission, and model-refresher replaces
  // it only after an actual responder returns HTTP 200. Never invent a
  // placeholder route such as x-preview-f during bootstrap.
  // Rules (in order):
  //  1. Missing/invalid default -> seed deepseek-free + first served model.
  //  2. Default pointing at a removed route (gemini-web, perplexity-free, or
  //     the consolidated opencode-free duplicate) -> migrate to deepseek-free,
  //     keeping the same model id when the single lane still serves it.
  //  3. Default pointing at deepseek-free with that model still listed ->
  //     KEEP the user's choice (only strip a stale reasoningEffort when the
  //     model is not a DeepSeek reasoning model).
  //  4. Default pointing at deepseek-free whose model is gone -> fall back to
  //     deepseek-free first served model.
  //  5. Default pointing at an unrelated user provider -> never touch.
  const defaultModel = settings['agent-default-model'] as
    | { provider?: string; model?: string; reasoningEffort?: string }
    | undefined;
  const freeModels = Array.isArray(providers[DEFAULT_PROVIDER]?.models)
    ? providers[DEFAULT_PROVIDER]!.models as { id?: unknown }[]
    : [];
  const firstModel = freeModels.find((entry) => typeof entry?.id === 'string')?.id as string
    | undefined;
  const modelIdsOf = (providerId: string): Set<string> => {
    const models = providers[providerId]?.models;
    if (!Array.isArray(models)) return new Set();
    return new Set(
      models
        .map((entry) => (entry !== null && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string'
          ? (entry as { id: string }).id
          : null))
        .filter((id): id is string => id !== null),
    );
  };
  const stripStaleEffort = (entry: { provider?: string; model?: string; reasoningEffort?: string }): boolean => {
    if (entry.reasoningEffort !== undefined && !isDeepSeekModel(entry.model)) {
      const { reasoningEffort: _staleEffort, ...withoutStaleEffort } = entry;
      settings['agent-default-model'] = withoutStaleEffort;
      return true;
    }
    return false;
  };
  if (!defaultModel || typeof defaultModel.model !== 'string' || typeof defaultModel.provider !== 'string') {
    if (firstModel !== undefined) {
      settings['agent-default-model'] = {
        provider: DEFAULT_PROVIDER,
        model: firstModel,
      };
      seeded = true;
    }
  } else if (
    defaultModel.provider === REMOVED_GEMINI_PROVIDER
    || defaultModel.provider === LEGACY_PERPLEXITY_PROVIDER
    || defaultModel.provider === OPENCODE_PROVIDER
  ) {
    // Migrate removed routes to the single lane, preserving the model id when
    // the consolidated lane still serves it.
    const servedIds = modelIdsOf(DEFAULT_PROVIDER);
    const migrated = servedIds.has(defaultModel.model) ? defaultModel.model : firstModel ?? defaultModel.model;
    settings['agent-default-model'] = {
      provider: DEFAULT_PROVIDER,
      model: migrated,
    };
    seeded = true;
  } else if (defaultModel.provider === DEFAULT_PROVIDER) {
    if (modelIdsOf(DEFAULT_PROVIDER).has(defaultModel.model)) {
      // User's chosen model still served: keep it, clean stale effort only.
      if (stripStaleEffort(defaultModel)) seeded = true;
    } else if (firstModel !== undefined) {
      // Chosen model no longer served: fall back to first served model.
      settings['agent-default-model'] = {
        provider: DEFAULT_PROVIDER,
        model: firstModel,
      };
      seeded = true;
    }
  } else {
    // Unrelated user provider (e.g. a custom gateway): never touch.
  }

  if (seeded) {
    writeSettings(settingsPath, settings);
    if (!existing) writeMarker(cfg.homeDir, cfg.lbBaseUrl);
  }
  return { seeded, path: settingsPath };
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
