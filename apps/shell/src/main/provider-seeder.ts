import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';

/**
 * Provider seeder — runs ONCE after the harness supervisor reports ready.
 * Idempotent merge into $DSH_HOME/settings.yaml. Only DeepSeek free is
 * seeded; OmniRoute stays out of the seed (user adds it via wizard).
 */

export interface SeederConfig {
  homeDir: string; // DSH_HOME
  lbBaseUrl: string; // http://127.0.0.1:<PUERTO_LB>
  apiKeyEnv?: string; // default FREECODE_PUBLIC_KEY
  defaultProvider?: string; // default deepseek-free
}

interface ProviderEntry {
  api: string;
  baseURL: string;
  apiKeyEnv?: string;
  defaultInput?: string[];
  models?: unknown[];
}

interface SettingsShape {
  'llm-pi-ai'?: {
    defaultProvider?: string;
    providers?: Record<string, ProviderEntry>;
  };
  [key: string]: unknown;
}

const DEFAULT_PROVIDER = 'deepseek-free';
const DEFAULT_API_KEY_ENV = 'FREECODE_PUBLIC_KEY';

export function seedProviders(cfg: SeederConfig): { seeded: boolean; path: string } {
  const settingsPath = join(cfg.homeDir, 'settings.yaml');
  const settings: SettingsShape = readSettings(settingsPath);

  const section = settings['llm-pi-ai'] ?? (settings['llm-pi-ai'] = {});
  const providers = section.providers ?? (section.providers = {});

  const existing = providers[DEFAULT_PROVIDER];
  if (existing) {
    // Rule: existing deepseek-free -> update baseURL ONLY, nothing else.
    let seeded = false;
    if (existing.baseURL !== cfg.lbBaseUrl) {
      existing.baseURL = cfg.lbBaseUrl;
      seeded = true;
    }
    if (seeded) writeSettings(settingsPath, settings);
    return { seeded, path: settingsPath };
  }

  // Fresh seed.
  providers[DEFAULT_PROVIDER] = {
    api: 'openai-completions',
    baseURL: cfg.lbBaseUrl,
    apiKeyEnv: cfg.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    defaultInput: ['text'],
    models: [], // model-refresher fills after first probe
  };
  // defaultProvider only if absent or pointing at a deleted provider.
  if (
    section.defaultProvider === undefined ||
    !Object.prototype.hasOwnProperty.call(providers, section.defaultProvider)
  ) {
    section.defaultProvider = cfg.defaultProvider ?? DEFAULT_PROVIDER;
  }

  writeSettings(settingsPath, settings);
  return { seeded: true, path: settingsPath };
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
  // Preserve the user's existing file content ordering by dumping fresh YAML.
  const yaml = dumpYaml(settings, { noRefs: true, lineWidth: 120 });
  writeFileSync(path, yaml, 'utf8');
}