import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedProviders } from '../src/main/provider-seeder.js';
import { harnessSettingsPath, readHarnessSettings, writeHarnessSettings } from '../src/main/harness-settings.js';

const roots: string[] = [];
const LB = 'http://127.0.0.1:41234/v1';
function home() { const path = mkdtempSync(join(tmpdir(), 'dsh-seed-profile-')); roots.push(path); return path; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });
describe('provider startup migration', () => {
  it('seeds Phoenix Auto and only the packaged model allowlist with its private runtime key', () => {
    const root = home();
    seedProviders({
      homeDir: root,
      lbBaseUrl: LB,
      modelIds: ['auto', 'pollinations/openai-fast', 'kilo/step-3.5-flash-free'],
      apiKeyEnv: 'FREECODE_PHOENIX_API_KEY',
    });
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['freecode-phoenix']).toMatchObject({
      displayName: 'Phoenix',
      api: 'openai-completions',
      baseURL: LB,
      apiKeyEnv: 'FREECODE_PHOENIX_API_KEY',
      defaultInput: ['text'],
      models: [
        { id: 'auto' },
        { id: 'pollinations/openai-fast' },
        { id: 'kilo/step-3.5-flash-free' },
      ],
    });
    expect(settings['agent-default-model']).toEqual({ provider: 'freecode-phoenix', model: 'auto' });
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeUndefined();
  });

  it('migrates an old managed default to Auto Phoenix while preserving unrelated user routes', () => {
    const root = home();
    writeHarnessSettings(root, {
      'llm-pi-ai': { providers: {
        'deepseek-free': { displayName: 'Legacy route', models: [{ id: 'old-model' }] },
        custom: { displayName: 'My route', baseURL: 'http://127.0.0.1:9999/v1', models: [{ id: 'mine' }] },
      } },
      'agent-default-model': { provider: 'deepseek-free', model: 'old-model' },
    });
    seedProviders({
      homeDir: root,
      lbBaseUrl: LB,
      modelIds: ['auto', 'pollinations/openai-fast'],
    });
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['freecode-phoenix'].models).toEqual([
      { id: 'auto', selectable: false }, { id: 'pollinations/openai-fast', selectable: false },
    ]);
    expect(settings['agent-default-model']).toEqual({ provider: 'freecode-phoenix', model: 'auto' });
    expect(settings['llm-pi-ai'].providers.custom).toEqual({
      displayName: 'My route', baseURL: 'http://127.0.0.1:9999/v1', models: [{ id: 'mine' }],
    });
  });

  it('rejects an untrusted or unordered Phoenix model seed', () => {
    const root = home();
    expect(() => seedProviders({ homeDir: root, lbBaseUrl: LB, modelIds: ['agent', 'openai/paid-model'] }))
      .toThrow(/Phoenix model IDs/);
    expect(existsSync(harnessSettingsPath(root))).toBe(false);
  });

  it('creates only a valid dormant profile and no legacy placeholder', () => {
    const root = home(); const result = seedProviders({homeDir: root, lbBaseUrl: LB});
    expect(result).toEqual({seeded: true, path: harnessSettingsPath(root)});
    expect(readHarnessSettings(root)['llm-pi-ai'].providers).toEqual({});
    expect(readHarnessSettings(root)['agent-default-model']).toBeUndefined();
    expect(existsSync(join(root, 'settings.yaml'))).toBe(false);
  });
  it('does not rewrite an already dormant profile', () => {
    const root = home(); seedProviders({homeDir: root, lbBaseUrl: LB});
    const before = readFileSync(harnessSettingsPath(root), 'utf8');
    expect(seedProviders({homeDir: root, lbBaseUrl: LB}).seeded).toBe(false);
    expect(readFileSync(harnessSettingsPath(root), 'utf8')).toBe(before);
  });
  it('removes a stale Phoenix route when no verified packaged model catalog was provided', () => {
    const root = home();
    writeHarnessSettings(root, {
      'llm-pi-ai': { providers: {
        'freecode-phoenix': { displayName: 'Phoenix', models: [{ id: 'old-model' }] },
      } },
      'agent-default-model': { provider: 'freecode-phoenix', model: 'old-model' },
    });
    seedProviders({ homeDir: root, lbBaseUrl: LB });
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['freecode-phoenix']).toBeUndefined();
    expect(settings['agent-default-model']).toBeUndefined();
  });
  it.each(['DeepSeek Free (pool)', 'FreeLLMPool', 'OpenCode Free'])('retires %s models and default until verified', (label) => {
    const root = home();
    writeHarnessSettings(root, {'llm-pi-ai': {providers: {'deepseek-free': {displayName: label, models: [{id: 'x-preview-f'}]}}}, 'agent-default-model': {provider: 'deepseek-free', model: 'x-preview-f'}});
    seedProviders({homeDir: root, lbBaseUrl: LB});
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeUndefined();
    expect(settings['agent-default-model']).toBeUndefined();
  });
  it('retires the retired kilo-free group and its default at boot', () => {
    const root = home();
    writeHarnessSettings(root, {'llm-pi-ai': {providers: {'kilo-free': {displayName: 'Kilo Free', baseURL: 'http://127.0.0.1:1111/v1', models: [{id: 'cohere/north-mini-code:free'}]}}}, 'agent-default-model': {provider: 'kilo-free', model: 'cohere/north-mini-code:free'}});
    seedProviders({homeDir: root, lbBaseUrl: LB});
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['kilo-free']).toBeUndefined();
    expect(settings['agent-default-model']).toBeUndefined();
  });
  it('migrates user routes/preferences, removes only owned legacy lanes and keeps the original backup', () => {
    const root = home();
    const legacy = {
      'llm-pi-ai': {providers: {
        custom: {api: 'openai-completions', baseURL: 'http://127.0.0.1:9999/v1', models: ['custom']},
        'opencode-free': {displayName: 'OpenCode No-Auth', models: ['stale']},
        'perplexity-free': {displayName: 'Perplexity Free (local)', models: ['stale']},
        'gemini-web': {models: ['stale']},
      }},
      'agent-default-model': {provider: 'custom', model: 'custom'},
      'ui-theme': {dark: true},
    };
    const text = JSON.stringify(legacy); writeFileSync(join(root, 'settings.yaml'), text);
    seedProviders({homeDir: root, lbBaseUrl: LB});
    const settings = readHarnessSettings(root);
    expect(Object.keys(settings['llm-pi-ai'].providers)).toEqual(['custom']);
    expect(settings['llm-pi-ai'].providers.custom).toEqual(legacy['llm-pi-ai'].providers.custom);
    expect(settings['agent-default-model']).toEqual(legacy['agent-default-model']);
    expect(readHarnessSettings(root)['ui-theme']).toEqual({dark: true});
    expect(readFileSync(join(root, 'settings.yaml.freecode-profile-backup'), 'utf8')).toBe(text);
    seedProviders({homeDir: root, lbBaseUrl: LB});
    expect(readFileSync(join(root, 'settings.yaml.freecode-profile-backup'), 'utf8')).toBe(text);
  });
  it.each(['opencode-free', 'perplexity-free'])('preserves a user-owned route using the %s key', (key) => {
    const root = home();
    const route = {displayName: 'My own provider', models: ['mine'], baseURL: 'http://127.0.0.1:9999'};
    writeHarnessSettings(root, {'llm-pi-ai': {providers: {[key]: route}}, 'agent-default-model': {provider: key, model: 'mine'}});
    seedProviders({homeDir: root, lbBaseUrl: LB});
    expect(readHarnessSettings(root)['llm-pi-ai'].providers[key]).toEqual(route);
    expect(readHarnessSettings(root)['agent-default-model']).toEqual({provider: key, model: 'mine'});
  });
});
