import { harnessSettingsPath, readHarnessSettings, writeHarnessSettings } from './harness-settings.js';

export interface SeederConfig {
  homeDir: string;
  /** The gateway is not published until its catalog has verified responders. */
  lbBaseUrl: string;
  apiKeyEnv?: string;
}

/**
 * Retire app-owned routes before DSH reads its active web profile. Current DSH
 * imports settings.yaml only once at boot and rejects models:[]; a dormant
 * managed route must be absent, not a schema-invalid placeholder. The model
 * refresher publishes the current endpoint and verified models through HMR.
 */
export function seedProviders(cfg: SeederConfig): { seeded: boolean; path: string } {
  const settings = readHarnessSettings(cfg.homeDir);
  const section = settings['llm-pi-ai'] ?? (settings['llm-pi-ai'] = {});
  const providers = section.providers ?? (section.providers = {});
  delete providers['deepseek-free'];
  const removed = new Set(['deepseek-free', 'gemini-web']);
  delete providers['gemini-web'];
  if (providers['opencode-free']?.displayName === 'OpenCode No-Auth') {
    delete providers['opencode-free']; removed.add('opencode-free');
  }
  if (providers['perplexity-free']?.displayName === 'Perplexity Free (local)') {
    delete providers['perplexity-free']; removed.add('perplexity-free');
  }
  if (removed.has(settings['agent-default-model']?.provider)) delete settings['agent-default-model'];
  return { seeded: writeHarnessSettings(cfg.homeDir, settings), path: harnessSettingsPath(cfg.homeDir) };
}
