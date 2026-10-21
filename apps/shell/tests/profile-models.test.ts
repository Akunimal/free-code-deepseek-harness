import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { load } from 'js-yaml';
import { seedProviders } from '../src/main/provider-seeder.js';
import { refreshModels } from '../src/main/model-refresher.js';
import { readHarnessSettings, writeHarnessSettings } from '../src/main/harness-settings.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'freecode-profile-models-')); roots.push(home);
  const path = join(home, 'profiles/web/cordis.patch.yml'); mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `# user profile must survive\n- id: llm-pi-ai\n  name: '@deepseek-ai/dsh-llm-pi-ai'\n  config:\n    providers:\n      custom:\n        api: openai-completions\n        baseURL: http://127.0.0.1:7777/v1\n        models: [custom-model]\n      freecode-phoenix:\n        api: openai-completions\n        baseURL: http://127.0.0.1:50291/v1\n        models: [{id: x-preview-f}]\n- id: agent-default-model\n  name: '@deepseek-ai/dsh-agent-default-model'\n  config: {provider: freecode-phoenix, model: x-preview-f}\n`);
  return { home, path, data: join(home, 'shell') };
}
function profile(path: string): any[] { return load(readFileSync(path, 'utf8')) as any[]; }
function providers(path: string) { return profile(path).find(x => x.id === 'llm-pi-ai').config.providers; }
function upstream(ids: string[], success = true) {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => String(url).endsWith('/models')
    ? new Response(JSON.stringify({data: ids.map(id => ({id}))}), {status: 200})
    : new Response(success
      ? JSON.stringify({choices: [{message: {role: 'assistant', content: 'pong'}}]})
      : 'forbidden', {status: success ? 200 : 403})));
}

describe('active DSH profile model boundary', () => {
  it('preserves a concurrent user provider/default edit when retiring the managed route', () => {
    const {home, path} = fixture();
    const snapshot = readHarnessSettings(home);
    const text = readFileSync(path, 'utf8').replace('models: [custom-model]', 'models: [user-changed-model]')
      .replace('config: {provider: freecode-phoenix, model: x-preview-f}', 'config: {provider: custom, model: user-changed-model}');
    writeFileSync(path, text);
    snapshot['llm-pi-ai'].providers['freecode-phoenix'].models = [];
    writeHarnessSettings(home, snapshot);
    expect(providers(path).custom.models).toEqual(['user-changed-model']);
    expect(profile(path).find(x => x.id === 'agent-default-model')?.config).toEqual({provider: 'custom', model: 'user-changed-model'});
  });

  it('refuses a malformed profile without overwriting user data', () => {
    const {home, path} = fixture(); const malformed = '- id: [unterminated';
    writeFileSync(path, malformed);
    expect(() => seedProviders({homeDir: home, lbBaseUrl: 'http://127.0.0.1:51593/v1'})).toThrow('Invalid DSH configuration');
    expect(readFileSync(path, 'utf8')).toBe(malformed);
  });
  it('removes the stale app route and default before boot without losing custom routes', () => {
    const {home, path} = fixture();
    seedProviders({homeDir: home, lbBaseUrl: 'http://127.0.0.1:51593/v1'});
    expect(providers(path)['freecode-phoenix']).toBeUndefined();
    expect(providers(path).custom.models).toEqual(['custom-model']);
    expect(profile(path).find(x => x.id === 'agent-default-model')).toBeUndefined();
    expect(existsSync(join(home, 'settings.yaml'))).toBe(false);
  });

  it('publishes multiple verified models and the current port to the actual watched profile', async () => {
    const {home, path, data} = fixture(); upstream(['big-pickle', 'step-5-preview-free']);
    await refreshModels({homeDir: home, userDataDir: data, lbBaseUrl: 'http://127.0.0.1:51593'});
    expect(providers(path)['freecode-phoenix']).toMatchObject({baseURL: 'http://127.0.0.1:51593/v1', models: [{id: 'big-pickle'}, {id: 'step-5-preview-free'}]});
    expect(providers(path).custom.models).toEqual(['custom-model']);
    expect(readFileSync(path, 'utf8')).toContain('# user profile must survive');
    expect(existsSync(join(home, 'settings.yaml'))).toBe(false);
  });

  it('removes an empty managed route then recovers and changes ports without stale IDs', async () => {
    const {home, path, data} = fixture(); upstream(['big-pickle'], false);
    await refreshModels({homeDir: home, userDataDir: data, lbBaseUrl: 'http://127.0.0.1:51593'});
    expect(providers(path)['freecode-phoenix']).toBeUndefined();
    upstream(['cat-jam-free', 'big-pickle']);
    await refreshModels({homeDir: home, userDataDir: data, lbBaseUrl: 'http://127.0.0.1:60001'});
    expect(providers(path)['freecode-phoenix'].baseURL).toBe('http://127.0.0.1:60001/v1');
    expect(providers(path)['freecode-phoenix'].models.map((x: any) => x.id)).toEqual(['cat-jam-free', 'big-pickle']);
  });

  it('preserves unrelated inert YAML tags and comments, and prevents legacy re-import of the stale route', () => {
    const {home, path} = fixture();
    writeFileSync(path, readFileSync(path, 'utf8') + '\n# do not execute or rewrite this expression\n- id: custom-plugin\n  disabled: !!js process.env.USER_PLUGIN_DISABLED\n');
    writeFileSync(join(home, 'settings.yaml'), 'llm-pi-ai:\n  providers:\n    freecode-phoenix:\n      models: [{id: x-preview-f}]\nui-theme:\n  dark: true\n');
    seedProviders({homeDir: home, lbBaseUrl: 'http://127.0.0.1:51593/v1'});
    expect(readFileSync(path, 'utf8')).toContain('disabled: !!js process.env.USER_PLUGIN_DISABLED');
    expect(readFileSync(path, 'utf8')).toContain('# do not execute or rewrite this expression');
    expect(readFileSync(join(home, 'settings.yaml'), 'utf8')).not.toContain('x-preview-f');
    expect(readFileSync(join(home, 'settings.yaml'), 'utf8')).toContain('dark: true');
  });
});
