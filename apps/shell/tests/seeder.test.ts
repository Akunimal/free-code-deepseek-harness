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
  it('seeds freecode-opencode with DeepSeek V4.1 Flash as the default model out-of-the-box', () => {
    const root = home();
    seedProviders({
      homeDir: root,
      ocBaseUrl: 'http://127.0.0.1:18080/v1',
      ocModelIds: ['deepseek-v4.1-flash-free', 'glm-5.3-flash-free'],
    });
    const settings = readHarnessSettings(root);
    expect(settings['agent-default-model']).toEqual({
      provider: 'freecode-opencode',
      model: 'deepseek-v4.1-flash-free',
    });
    expect(settings['llm-pi-ai'].providers['freecode-opencode']).toEqual({
      displayName: 'OpenCode Free',
      api: 'openai-completions',
      baseURL: 'http://127.0.0.1:18080/v1',
      apiKeyEnv: 'FREECODE_OPENCODE_API_KEY',
      defaultInput: ['text', 'image'],
      models: [
        { id: 'deepseek-v4.1-flash-free' },
        { id: 'glm-5.3-flash-free' },
      ],
    });
    expect(settings['llm-pi-ai'].providers['freecode-phoenix']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['our-free-model']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeUndefined();
  });

  it('migrates an old Phoenix or our-free-model default to freecode-opencode while preserving user routes', () => {
    const root = home();
    writeHarnessSettings(root, {
      'llm-pi-ai': {
        providers: {
          'freecode-phoenix': { displayName: 'Phoenix', models: [{ id: 'auto' }] },
          'our-free-model': { displayName: 'Our Free Model', models: [{ id: 'deepseek-v4.1-flash-free' }] },
          custom: { displayName: 'My route', baseURL: 'http://127.0.0.1:9999/v1', models: [{ id: 'mine' }] },
        },
      },
      'agent-default-model': { provider: 'our-free-model', model: 'deepseek-v4.1-flash-free' },
    });
    seedProviders({
      homeDir: root,
      ocBaseUrl: 'http://127.0.0.1:18080/v1',
    });
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['freecode-phoenix']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['our-free-model']).toBeUndefined();
    expect(settings['agent-default-model']).toEqual({
      provider: 'freecode-opencode',
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
    seedProviders({
      homeDir: root,
      ocBaseUrl: 'http://127.0.0.1:18080/v1',
    });
    const settings = readHarnessSettings(root);
    expect(settings['llm-pi-ai'].providers['kilo-free']).toBeUndefined();
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeUndefined();
    expect(settings['agent-default-model']).toEqual({
      provider: 'freecode-opencode',
      model: 'deepseek-v4.1-flash-free',
    });
  });

  it('ensures runtime environment supplies FREECODE_OPENCODE_API_KEY to avoid MISSING_CREDENTIAL', async () => {
    const { createShellRuntime } = await import('../src/main/runtime.js');
    const root = home();
    const runtime = await createShellRuntime({
      resourcesDir: root,
      nodePath: process.execPath,
      userDataDir: root,
    });
    // The supervisor's extraEnv must contain FREECODE_OPENCODE_API_KEY
    const supervisor = runtime.supervisor as any;
    expect(supervisor.cfg.extraEnv.FREECODE_OPENCODE_API_KEY).toBe('freecode-public');
    expect(supervisor.cfg.extraEnv.FREECODE_PUBLIC_KEY).toBe('public');
  });
});
