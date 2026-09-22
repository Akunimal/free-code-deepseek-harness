import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { seedProviders } from '../src/main/provider-seeder.js';
import { reasoningEffortsForModel } from '../src/main/reasoning-policy.js';

const LB = 'http://127.0.0.1:41234';

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-seed-test-'));
}

describe('provider-seeder', () => {
  it('seeds deepseek-free with openai-completions pointing at the LB', () => {
    const home = tmpHome();
    const { seeded } = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(seeded).toBe(true);
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].defaultProvider).toBeUndefined(); // no such key upstream
    const p = settings['llm-pi-ai'].providers['deepseek-free'];
    expect(p.displayName).toBe('FreeLLMPool');
    expect(p.api).toBe('openai-completions');
    expect(p.baseURL).toBe(LB);
    expect(p.apiKeyEnv).toBe('FREECODE_PUBLIC_KEY');
    expect(p.defaultInput).toEqual(['text']);
    // Non-empty models: upstream refuses empty lists (settings-rejected).
    expect(p.models).toEqual([{ id: 'x-preview-f', reasoningEfforts: false }]);
    // Route-level reasoning config for deepseek models in the pool.
    expect(p.compat).toEqual({ thinkingFormat: 'deepseek' });
    // reasoning removed from provider level — each model carries its own capability.
    expect(p.reasoning).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['gemini-web']).toBeUndefined();
    // Provider insertion order contains only the built-in pool after the
    // managed Gemini migration has run.
    expect(Object.keys(settings['llm-pi-ai'].providers)).toEqual([
      'deepseek-free',
    ]);
    // Marker written for the versioned seed.
    expect(existsSync(join(home, '.freecode-seeded-v1'))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });

  it('updates only baseURL when deepseek-free already exists', () => {
    const home = tmpHome();
    const first = seedProviders({ homeDir: home, lbBaseUrl: 'http://127.0.0.1:1111' });
    expect(first.seeded).toBe(true);
    // User tweaks the provider afterwards.
    const path = join(home, 'settings.yaml');
    const s = loadYaml(readFileSync(path, 'utf8')) as any;
    s['llm-pi-ai'].providers['deepseek-free'].defaultInput = ['text', 'image'];
    s['llm-pi-ai'].providers['deepseek-free'].api = 'anthropic-completions';
    writeFileSync(path, JSON.stringify(s));

    // Re-seed with a new LB port: only baseURL must change.
    const second = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(second.seeded).toBe(true);
    const after = loadYaml(readFileSync(path, 'utf8')) as any;
    const p = after['llm-pi-ai'].providers['deepseek-free'];
    expect(p.baseURL).toBe(LB);
    expect(p.api).toBe('anthropic-completions'); // untouched
    expect(p.defaultInput).toEqual(['text', 'image']); // untouched
    rmSync(home, { recursive: true, force: true });
  });

  it('migrates the legacy DeepSeek Free pool label to FreeLLMPool', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(path, `
llm-pi-ai:
  providers:
    deepseek-free:
      displayName: DeepSeek Free (pool)
      api: openai-completions
      baseURL: ${LB}
      models:
        - id: x-preview-f
`);

    const { seeded } = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(seeded).toBe(true);
    const settings = loadYaml(readFileSync(path, 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['deepseek-free'].displayName)
      .toBe('FreeLLMPool');
    rmSync(home, { recursive: true, force: true });
  });

  it('never deletes user-added providers', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(
      path,
      `llm-pi-ai:\n  providers:\n    omniroute:\n      api: openai-completions\n      baseURL: http://127.0.0.1:9999\n      models:\n        - id: route-model\n`,
    );
    const { seeded } = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(seeded).toBe(true);
    const after = loadYaml(readFileSync(path, 'utf8')) as any;
    const section = after['llm-pi-ai'];
    // User provider intact.
    expect(section.providers.omniroute.baseURL).toBe('http://127.0.0.1:9999');
    // Seed added alongside.
    expect(section.providers['deepseek-free'].baseURL).toBe(LB);
    rmSync(home, { recursive: true, force: true });
  });

  it('removes the old managed Gemini route without touching unrelated providers', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(path, `
llm-pi-ai:
  providers:
    gemini-web:
      displayName: Gemini Web (local)
      api: openai-completions
      baseURL: http://127.0.0.1:8081/v1
      models:
        - id: gemini-3.7-flash
    custom-provider:
      displayName: My Gateway
      api: openai-completions
      baseURL: http://127.0.0.1:9999/v1
      models:
        - id: custom-model
`);

    const { seeded } = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(seeded).toBe(true);
    const settings = loadYaml(readFileSync(path, 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['gemini-web']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['custom-provider']).toEqual({
      displayName: 'My Gateway',
      api: 'openai-completions',
      baseURL: 'http://127.0.0.1:9999/v1',
      models: [{ id: 'custom-model' }],
    });
    rmSync(home, { recursive: true, force: true });
  });

  it('removes the legacy built-in Perplexity route during migration', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(path, `
llm-pi-ai:
  providers:
    perplexity-free:
      displayName: Perplexity Free (local)
      api: openai-completions
      baseURL: http://127.0.0.1:3030/v1
      models:
        - id: gpt52
    custom-perplexity:
      displayName: My Perplexity Gateway
      api: openai-completions
      baseURL: http://127.0.0.1:9999/v1
      models:
        - id: custom-model
`);

    const { seeded } = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(seeded).toBe(true);
    const settings = loadYaml(readFileSync(path, 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['perplexity-free']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['custom-perplexity'].baseURL)
      .toBe('http://127.0.0.1:9999/v1');
    rmSync(home, { recursive: true, force: true });
  });

  it('no-ops when seed already matches', () => {
    const home = tmpHome();
    seedProviders({ homeDir: home, lbBaseUrl: LB });
    const mtime1 = existsSync(join(home, 'settings.yaml'))
      ? readFileSync(join(home, 'settings.yaml'), 'utf8')
      : '';
    const { seeded } = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(seeded).toBe(false);
    const mtime2 = readFileSync(join(home, 'settings.yaml'), 'utf8');
    expect(mtime1).toBe(mtime2); // untouched
    rmSync(home, { recursive: true, force: true });
  });

  it('migrates stale route/default reasoning from older pool settings', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(path, `
llm-pi-ai:
  providers:
    deepseek-free:
      api: openai-completions
      baseURL: http://127.0.0.1:1111/v1
      reasoning: high
      models:
        - id: x-preview-f
          reasoningEfforts:
            off:
            high: high
agent-default-model:
  provider: deepseek-free
  model: x-preview-f
  reasoningEffort: high
`);

    const { seeded } = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(seeded).toBe(true);
    const settings = loadYaml(readFileSync(path, 'utf8')) as any;
    const provider = settings['llm-pi-ai'].providers['deepseek-free'];
    expect(provider.reasoning).toBeUndefined();
    expect(provider.models).toEqual([{ id: 'x-preview-f', reasoningEfforts: false }]);
    expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'x-preview-f' });
    rmSync(home, { recursive: true, force: true });
  });

  it('seeds opencode-free when the no-auth sidecar URL is provided', () => {
    const home = tmpHome();
    const { seeded } = seedProviders({
      homeDir: home,
      lbBaseUrl: LB,
      opencodeBaseUrl: 'http://127.0.0.1:45678',
    });
    expect(seeded).toBe(true);
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    const p = settings['llm-pi-ai'].providers['opencode-free'];
    expect(p.displayName).toBe('OpenCode No-Auth');
    expect(p.api).toBe('openai-completions');
    expect(p.baseURL).toBe('http://127.0.0.1:45678/v1');
    expect(p.apiKeyEnv).toBe('FREECODE_PUBLIC_KEY');
    expect(p.defaultInput).toEqual(['text']);
    // Non-empty fallback so the upstream validator accepts the route; the
    // model-refresher replaces it with the live anonymous-eligible catalog.
    expect(p.models).toEqual([
      { id: 'deepseek-v4-flash-free', reasoningEfforts: reasoningEffortsForModel('deepseek-v4-flash-free') },
    ]);
    expect(Object.keys(settings['llm-pi-ai'].providers)).toEqual(['deepseek-free', 'opencode-free']);
    rmSync(home, { recursive: true, force: true });
  });

  it('removes the managed opencode-free route when the sidecar is down', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(path, `
llm-pi-ai:
  providers:
    deepseek-free:
      api: openai-completions
      baseURL: ${LB}
      models:
        - id: x-preview-f
    opencode-free:
      displayName: OpenCode No-Auth
      api: openai-completions
      baseURL: http://127.0.0.1:45678/v1
      models:
        - id: deepseek-v4-flash-free
`);

    const { seeded } = seedProviders({ homeDir: home, lbBaseUrl: LB });
    expect(seeded).toBe(true);
    const settings = loadYaml(readFileSync(path, 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['opencode-free']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeDefined();
    rmSync(home, { recursive: true, force: true });
  });

  it('never removes a user provider sharing the opencode-free key', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(path, `
llm-pi-ai:
  providers:
    opencode-free:
      displayName: My Own Gateway
      api: openai-completions
      baseURL: http://127.0.0.1:9999/v1
      models:
        - id: custom
`);

    seedProviders({ homeDir: home, lbBaseUrl: LB });
    const settings = loadYaml(readFileSync(path, 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['opencode-free'].displayName).toBe('My Own Gateway');
    expect(settings['llm-pi-ai'].providers['opencode-free'].baseURL).toBe('http://127.0.0.1:9999/v1');
    rmSync(home, { recursive: true, force: true });
  });

  it('normalizes MiMo V2.5 to binary thinking and its DeepSeek wire dialect', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(path, `
llm-pi-ai:
  providers:
    deepseek-free:
      api: openai-completions
      baseURL: ${LB}/v1
      models:
        - id: mimo-v2.5
          reasoningEfforts:
            off:
            low: low
            high: high
          compat:
            thinkingFormat: deepseek
`);

    seedProviders({ homeDir: home, lbBaseUrl: LB });
    const settings = loadYaml(readFileSync(path, 'utf8')) as any;
    const model = settings['llm-pi-ai'].providers['deepseek-free'].models[0];
    expect(model.reasoningEfforts).toEqual({ off: null, high: 'high' });
    expect(model.compat).toEqual({
      thinkingFormat: 'deepseek',
      supportsReasoningEffort: false,
    });
    rmSync(home, { recursive: true, force: true });
  });
});
