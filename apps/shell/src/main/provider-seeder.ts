import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';

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
 *   - Only DeepSeek free is seeded; OmniRoute stays out of the seed (the
 *     user adds it via the on-demand wizard).
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
/** Seed model — the model-refresher replaces this with the live catalog. */
const FALLBACK_MODELS = [{ id: 'nemotron-3.5-lightning' }];
const MARKER_FILE = '.freecode-seeded-v1';

export function seedProviders(cfg: SeederConfig): { seeded: boolean; path: string } {
  const settingsPath = join(cfg.homeDir, 'settings.yaml');
  const settings: SettingsShape = readSettings(settingsPath);

  const section = settings['llm-pi-ai'] ?? (settings['llm-pi-ai'] = {});
  const providers = section.providers ?? (section.providers = {});

  const existing = providers[DEFAULT_PROVIDER];
  let seeded = false;
  if (existing) {
    if (existing.baseURL !== cfg.lbBaseUrl) {
      existing.baseURL = cfg.lbBaseUrl;
      seeded = true;
    }
    if (Array.isArray(existing.models) && existing.models.length === 0) {
      existing.models = FALLBACK_MODELS;
      seeded = true;
    }
  } else {
    providers[DEFAULT_PROVIDER] = {
      displayName: 'DeepSeek Free (pool)',
      api: 'openai-completions',
      baseURL: cfg.lbBaseUrl,
      apiKeyEnv: cfg.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
      defaultInput: ['text'],
      models: FALLBACK_MODELS,
      compat: { thinkingFormat: 'deepseek' },
      // NOTE: reasoning removed — not all models support it; model-refresher sets
      // reasoningEfforts per-model for deepseek-* models only.
    };
    seeded = true;
  }

  // Ensure agent-default-model points to deepseek-free with a model that
  // the pool actually serves. If missing or pointing to a provider with no
  // API key configured (e.g. the built-in deepseek-official on a fresh
  // install), correct it to the free pool route.
  const defaultModel = settings['agent-default-model'] as
    | { provider?: string; model?: string; reasoningEffort?: string }
    | undefined;
  const freeModels = (existing?.models ?? FALLBACK_MODELS) as { id: string }[];
  const firstModel = freeModels[0]?.id ?? FALLBACK_MODELS[0]!.id;
  if (!defaultModel || defaultModel.provider !== DEFAULT_PROVIDER) {
    settings['agent-default-model'] = {
      provider: DEFAULT_PROVIDER,
      model: firstModel,
    };
    seeded = true;
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