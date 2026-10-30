import { harnessSettingsPath, readHarnessSettings, writeHarnessSettings } from './harness-settings.js';

export interface SeederConfig {
  homeDir: string;
  ocBaseUrl?: string;
  ocModelIds?: readonly string[];
  apiKeyEnv?: string;
}

export const OPENCODE_PROVIDER = 'freecode-opencode';
export const DEFAULT_MODEL = 'deepseek-v4.1-flash-free';

const LEGACY_MANAGED_PROVIDERS = [
  'deepseek-free',
  'kilo-free',
  'gemini-web',
  'freecode-phoenix',
  'our-free-model',
] as const;

/**
 * Retire app-owned legacy routes before DSH reads its active web profile.
 * Seed 'freecode-opencode' backed by the local opencode2api proxy stack.
 */
export function seedProviders(cfg: SeederConfig): { seeded: boolean; path: string } {
  const settings = readHarnessSettings(cfg.homeDir);
  const section = settings['llm-pi-ai'] ?? (settings['llm-pi-ai'] = {});
  const providers = section.providers ?? (section.providers = {});
  const removed = new Set<string>(LEGACY_MANAGED_PROVIDERS);
  for (const key of LEGACY_MANAGED_PROVIDERS) {
    delete providers[key];
  }
  if (providers['opencode-free']?.displayName === 'OpenCode No-Auth') {
    delete providers['opencode-free'];
    removed.add('opencode-free');
  }
  if (providers['perplexity-free']?.displayName === 'Perplexity Free (local)') {
    delete providers['perplexity-free'];
    removed.add('perplexity-free');
  }

  if (cfg.ocBaseUrl) {
    const models = (cfg.ocModelIds && cfg.ocModelIds.length > 0 ? cfg.ocModelIds : [DEFAULT_MODEL]).map((id) => ({ id }));
    providers[OPENCODE_PROVIDER] = {
      displayName: 'OpenCode Free',
      api: 'openai-completions',
      baseURL: cfg.ocBaseUrl,
      apiKeyEnv: cfg.apiKeyEnv ?? 'FREECODE_OPENCODE_API_KEY',
      defaultInput: ['text', 'image'],
      models,
    };
  }

  const selected = settings['agent-default-model'];
  if (selected === undefined || removed.has(selected.provider)) {
    settings['agent-default-model'] = { provider: OPENCODE_PROVIDER, model: DEFAULT_MODEL };
  }

  return { seeded: writeHarnessSettings(cfg.homeDir, settings), path: harnessSettingsPath(cfg.homeDir) };
}
