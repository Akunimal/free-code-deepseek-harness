import { harnessSettingsPath, readHarnessSettings, writeHarnessSettings } from './harness-settings.js';

export interface SeederConfig {
  homeDir: string;
}

const DEFAULT_PROVIDER = 'our-free-model';
const DEFAULT_MODEL = 'deepseek-v4.1-flash-free';
const LEGACY_MANAGED_PROVIDERS = [
  'deepseek-free',
  'kilo-free',
  'gemini-web',
  'freecode-opencode',
  'freecode-phoenix',
] as const;

/**
 * Retire app-owned legacy routes before DSH reads its active web profile.
 * Seed 'our-free-model' with DeepSeek V4.1 Flash as the default model.
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

  const selected = settings['agent-default-model'];
  if (selected === undefined || removed.has(selected.provider)) {
    settings['agent-default-model'] = { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
  }

  return { seeded: writeHarnessSettings(cfg.homeDir, settings), path: harnessSettingsPath(cfg.homeDir) };
}
