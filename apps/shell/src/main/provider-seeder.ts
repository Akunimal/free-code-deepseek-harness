import { harnessSettingsPath, readHarnessSettings, writeHarnessSettings } from './harness-settings.js';

export interface SeederConfig {
  homeDir: string;
  /** Private loopback URL for the hash-verified, packaged Phoenix service. */
  lbBaseUrl: string;
  /** Exact model IDs shipped in the hash-verified Phoenix payload; Auto first. */
  modelIds?: readonly string[];
  apiKeyEnv?: string;
}

const PHOENIX_PROVIDER = 'freecode-phoenix';
const LEGACY_MANAGED_PROVIDERS = ['deepseek-free', 'kilo-free', 'gemini-web'] as const;

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
  const removed = new Set<string>(LEGACY_MANAGED_PROVIDERS);
  for (const key of LEGACY_MANAGED_PROVIDERS) delete providers[key];
  const modelIds = cfg.modelIds;
  if (modelIds !== undefined) {
    if (modelIds[0] !== 'auto' || modelIds.length < 2 || new Set(modelIds).size !== modelIds.length
      || !modelIds.every((id) => typeof id === 'string' && id.length > 0)) {
      throw new Error('Phoenix model IDs must be unique, start with auto, and include at least one concrete model');
    }
    providers[PHOENIX_PROVIDER] = {
      displayName: 'Phoenix',
      api: 'openai-completions',
      baseURL: cfg.lbBaseUrl,
      apiKeyEnv: cfg.apiKeyEnv ?? 'FREECODE_PHOENIX_API_KEY',
      defaultInput: ['text'],
      // Registry membership survives health refresh; only live responders are
      // selectable. Saved pins remain resolvable while initial probes run.
      models: modelIds.map((id) => ({ id, selectable: false })),
    };
    const selected = settings['agent-default-model'];
    const selectedId = typeof selected?.model === 'string' ? selected.model : undefined;
    if (selected === undefined || removed.has(selected.provider)
      || (selected.provider === PHOENIX_PROVIDER && !modelIds.includes(selectedId ?? ''))) {
      settings['agent-default-model'] = { provider: PHOENIX_PROVIDER, model: 'auto' };
    }
  } else {
    // A Phoenix route is owned by this shell. Without the verified staged
    // catalog, leave it dormant instead of carrying models from an old build.
    delete providers[PHOENIX_PROVIDER];
    removed.add(PHOENIX_PROVIDER);
  }
  if (providers['opencode-free']?.displayName === 'OpenCode No-Auth') {
    delete providers['opencode-free']; removed.add('opencode-free');
  }
  if (providers['perplexity-free']?.displayName === 'Perplexity Free (local)') {
    delete providers['perplexity-free']; removed.add('perplexity-free');
  }
  if (removed.has(settings['agent-default-model']?.provider)) delete settings['agent-default-model'];
  return { seeded: writeHarnessSettings(cfg.homeDir, settings), path: harnessSettingsPath(cfg.homeDir) };
}
