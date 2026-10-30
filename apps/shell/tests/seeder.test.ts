import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedProviders } from '../src/main/provider-seeder.js';
import { harnessSettingsPath, readHarnessSettings, writeHarnessSettings } from '../src/main/harness-settings.js';

const roots: string[] = [];
function home() { const path = mkdtempSync(join(tmpdir(), 'dsh-seed-profile-')); roots.push(path); return path; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('provider startup migration', () => {
  it('seeds our-free-model with DeepSeek V4.1 Flash as the default model out-of-the-box', () => {
    const root = home();
    seedProviders({ homeDir: root });
    const settings = readHarnessSettings(root);
    expect(settings['agent-default-model']).toEqual({
      provider: 'our-free-model',
      model: 'deepseek-v4.1-flash-free',
    });
    expect(settings['llm-pi-ai'].providers['freecode-phoenix']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeUndefined();
  });

  it('migrates an old Phoenix default to our-free-model DeepSeek V4.1 Flash while preserving user routes', () => {
    const root = home();
    writeHarnessSettings(root, {
      'llm-pi-ai': {
        providers: {
          'freecode-phoenix': { displayName: 'Phoenix', models: [{ id: 'auto' }] },
          custom: { displayName: 'My route', baseURL: 'http://127.0.0.1:9999/v1', models: [{ id: 'mine' }] },
        },
      },
      'agent-default-model': { provider: 'freecode-phoenix', model: 'auto' },
    });
    seedProviders({ homeDir: root });
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['freecode-phoenix']).toBeUndefined();
    expect(settings['agent-default-model']).toEqual({
      provider: 'our-free-model',
      model: 'deepseek-v4.1-flash-free',
    });
    expect(settings['llm-pi-ai'].providers.custom).toEqual({
      displayName: 'My route',
      baseURL: 'http://127.0.0.1:9999/v1',
      models: [{ id: 'mine' }],
    });
  });

  it('retires the legacy deepseek-free and kilo-free groups at boot', () => {
    const root = home();
    writeHarnessSettings(root, {
      'llm-pi-ai': {
        providers: {
          'kilo-free': { displayName: 'Kilo Free', models: [{ id: 'kilo-1' }] },
          'deepseek-free': { displayName: 'DeepSeek Free', models: [{ id: 'ds-1' }] },
        },
      },
      'agent-default-model': { provider: 'kilo-free', model: 'kilo-1' },
    });
    seedProviders({ homeDir: root });
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['kilo-free']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeUndefined();
    expect(settings['agent-default-model']).toEqual({
      provider: 'our-free-model',
      model: 'deepseek-v4.1-flash-free',
    });
  });

  it('migrates user routes/preferences, removes only owned legacy lanes and keeps the original backup', () => {
    const root = home();
    const legacy = {
      'llm-pi-ai': {
        providers: {
          custom: { api: 'openai-completions', baseURL: 'http://127.0.0.1:9999/v1', models: ['custom'] },
          'opencode-free': { displayName: 'OpenCode No-Auth', models: ['stale'] },
          'perplexity-free': { displayName: 'Perplexity Free (local)', models: ['stale'] },
          'gemini-web': { models: ['stale'] },
          'freecode-phoenix': { models: ['stale'] },
        },
      },
      'agent-default-model': { provider: 'custom', model: 'custom' },
      'ui-theme': { dark: true },
    };
    const text = JSON.stringify(legacy);
    writeFileSync(join(root, 'settings.yaml'), text);
    seedProviders({ homeDir: root });
    const settings = readHarnessSettings(root);
    expect(Object.keys(settings['llm-pi-ai'].providers)).toEqual(['custom']);
    expect(settings['llm-pi-ai'].providers.custom).toEqual(legacy['llm-pi-ai'].providers.custom);
    expect(settings['agent-default-model']).toEqual(legacy['agent-default-model']);
    expect(readHarnessSettings(root)['ui-theme']).toEqual({ dark: true });
    expect(readFileSync(join(root, 'settings.yaml.freecode-profile-backup'), 'utf8')).toBe(text);
  });

  it.each(['opencode-free', 'perplexity-free'])('preserves a user-owned route using the %s key', (key) => {
    const root = home();
    const route = { displayName: 'My own provider', models: ['mine'], baseURL: 'http://127.0.0.1:9999' };
    writeHarnessSettings(root, {
      'llm-pi-ai': { providers: { [key]: route } },
      'agent-default-model': { provider: key, model: 'mine' },
    });
    seedProviders({ homeDir: root });
    expect(readHarnessSettings(root)['llm-pi-ai'].providers[key]).toEqual(route);
    expect(readHarnessSettings(root)['agent-default-model']).toEqual({ provider: key, model: 'mine' });
  });
});
