import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { seedProviders } from '../src/main/provider-seeder.js';

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
    expect(p.displayName).toBe('OpenCode Free Pool');
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
    const gemini = settings['llm-pi-ai'].providers['gemini-web'];
    expect(gemini.displayName).toBe('Gemini Web (local)');
    expect(gemini.api).toBe('openai-completions');
    expect(gemini.baseURL).toBe('http://127.0.0.1:8081/v1');
    expect(gemini.defaultInput).toEqual(['text', 'image']);
    expect(gemini.models).toEqual([
      { id: 'gemini-3.7-flash', reasoningEfforts: false },
      { id: 'gemini-3.6-flash', reasoningEfforts: false },
      { id: 'gemini-3.5-flash', reasoningEfforts: false },
      { id: 'gemini-3.5-flash-thinking', reasoningEfforts: false },
      { id: 'gemini-3.1-pro', reasoningEfforts: false },
      { id: 'gemini-3.1-pro-enhanced', reasoningEfforts: false },
      { id: 'gemini-auto', reasoningEfforts: false },
      { id: 'gemini-3.5-flash-thinking-lite', reasoningEfforts: false },
      { id: 'gemini-flash-lite', reasoningEfforts: false },
    ]);
    const perplexity = settings['llm-pi-ai'].providers['perplexity-free'];
    expect(perplexity.displayName).toBe('Perplexity Free (local)');
    expect(perplexity.api).toBe('openai-completions');
    expect(perplexity.baseURL).toBe('http://127.0.0.1:3030/v1');
    expect(perplexity.defaultInput).toEqual(['text', 'image']);
    expect(perplexity.models).toEqual([
      { id: 'experimental', reasoningEfforts: false },
      { id: 'gemini30flash', reasoningEfforts: false },
      { id: 'gemini30pro', reasoningEfforts: false },
      { id: 'gpt52', reasoningEfforts: false },
      { id: 'claude45sonnet', reasoningEfforts: false },
      { id: 'claude45sonnetthinking', reasoningEfforts: false },
      { id: 'claude46opus', reasoningEfforts: false },
      { id: 'grok41nonreasoning', reasoningEfforts: false },
      { id: 'kimik25thinking', reasoningEfforts: false },
    ]);
    // Provider insertion order is the selector order after the built-in pool.
    expect(Object.keys(settings['llm-pi-ai'].providers)).toEqual([
      'deepseek-free',
      'gemini-web',
      'perplexity-free',
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

  it('migrates the legacy DeepSeek Free pool label to OpenCode Free Pool', () => {
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
      .toBe('OpenCode Free Pool');
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

  it('preserves user customizations on the Gemini route', () => {
    const home = tmpHome();
    const path = join(home, 'settings.yaml');
    writeFileSync(path, `
llm-pi-ai:
  providers:
    gemini-web:
      displayName: My Gemini Gateway
      api: openai-completions
      baseURL: http://127.0.0.1:9999/v1
      apiKeyEnv: GEMINI_WEB2API_API_KEY
      models:
        - id: custom-model
`);

    seedProviders({ homeDir: home, lbBaseUrl: LB });
    const settings = loadYaml(readFileSync(path, 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['gemini-web']).toEqual({
      displayName: 'My Gemini Gateway',
      api: 'openai-completions',
      baseURL: 'http://127.0.0.1:9999/v1',
      apiKeyEnv: 'GEMINI_WEB2API_API_KEY',
      models: [{ id: 'custom-model' }],
    });
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
});
