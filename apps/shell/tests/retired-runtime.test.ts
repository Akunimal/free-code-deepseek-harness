import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dump, load } from 'js-yaml';
import { retireRemovedRuntime } from '../src/main/retired-runtime.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'freecode-retire-test-'));
  const home = join(root, 'dsh-home');
  mkdirSync(home);
  return { root, home, settings: join(home, 'settings.yaml') };
}

describe('retired optional runtime', () => {
  it('preserves a changed user default, rejects malformed settings and keeps unverified data', async () => {
    const f = fixture();
    try {
      writeFileSync(f.settings, dump({ 'llm-pi-ai': { providers: {
        'freecode-omniroute': { baseURL: 'http://127.0.0.1:1234/v1', models: [{ id: 'auto/coding:free' }] },
      } }, 'agent-default-model': { provider: 'custom', model: 'mine' } }));
      mkdirSync(join(f.root, 'omniroute-runtime'));
      writeFileSync(join(f.root, 'omniroute-runtime', 'keep'), 'unverified');
      await retireRemovedRuntime(f.root);
      expect((load(readFileSync(f.settings, 'utf8')) as any)['agent-default-model']).toEqual({ provider: 'custom', model: 'mine' });
      expect(readFileSync(join(f.root, 'omniroute-runtime', 'keep'), 'utf8')).toBe('unverified');
      writeFileSync(f.settings, '- invalid settings array');
      await expect(retireRemovedRuntime(f.root)).rejects.toThrow(/Invalid settings/);
      expect(readFileSync(f.settings, 'utf8')).toBe('- invalid settings array');
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });

  it('resumes an interrupted owned cleanup without touching unrelated folders', async () => {
    const f = fixture();
    try {
      mkdirSync(join(f.root, 'omniroute-data'));
      writeFileSync(join(f.root, '.freecode-retired-runtime-cleanup.json'), '{"schemaVersion":1}');
      mkdirSync(join(f.root, 'user-provider-data'));
      await retireRemovedRuntime(f.root);
      expect(existsSync(join(f.root, 'omniroute-data'))).toBe(false);
      expect(existsSync(join(f.root, 'user-provider-data'))).toBe(true);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  it('removes only the owned route and restores its recorded OpenCode default', async () => {
    const f = fixture();
    try {
      writeFileSync(f.settings, dump({ 'llm-pi-ai': { providers: {
        'deepseek-free': { models: [{ id: 'primary' }] },
        'freecode-omniroute': { baseURL: 'http://127.0.0.1:1234/v1', models: [{ id: 'auto/coding:free' }] },
        custom: { baseURL: 'http://example.invalid', models: [{ id: 'keep' }] },
      } }, 'agent-default-model': { provider: 'freecode-omniroute', model: 'auto/coding:free' }, other: 'keep' }));
      writeFileSync(join(f.root, 'model-fallback-state.json'), JSON.stringify({
        previous: { provider: 'deepseek-free', model: 'primary' }, assigned: { provider: 'freecode-omniroute', model: 'auto/coding:free' },
      }));
      await retireRemovedRuntime(f.root);
      const settings = load(readFileSync(f.settings, 'utf8')) as any;
      expect(settings['llm-pi-ai'].providers['freecode-omniroute']).toBeUndefined();
      expect(settings['llm-pi-ai'].providers.custom.models).toEqual([{ id: 'keep' }]);
      expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'primary' });
      expect(settings.other).toBe('keep');
      expect(existsSync(join(f.root, 'model-fallback-state.json'))).toBe(false);
      const once = readFileSync(f.settings, 'utf8');
      await retireRemovedRuntime(f.root);
      expect(readFileSync(f.settings, 'utf8')).toBe(once);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });

  it('never fabricates a model when retiring OmniRoute before Free models are verified', async () => {
    const f = fixture();
    try {
      writeFileSync(f.settings, dump({ 'llm-pi-ai': { providers: {
        'deepseek-free': { models: [] },
        'freecode-omniroute': { baseURL: 'http://127.0.0.1:1234/v1', models: [{ id: 'auto/coding:free' }] },
      } }, 'agent-default-model': { provider: 'freecode-omniroute', model: 'auto/coding:free' } }));
      await retireRemovedRuntime(f.root);
      const settings = load(readFileSync(f.settings, 'utf8')) as any;
      expect(settings['llm-pi-ai'].providers['freecode-omniroute']).toBeUndefined();
      expect(settings['agent-default-model']).toBeUndefined();
      expect(readFileSync(f.settings, 'utf8')).not.toContain('x-preview-f');
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });

  it('restores its recorded default even when that model awaits the next verified catalog', async () => {
    const f = fixture();
    try {
      writeFileSync(f.settings, dump({ 'llm-pi-ai': { providers: {
        'deepseek-free': { models: [] },
        'freecode-omniroute': { baseURL: 'http://127.0.0.1:1234/v1', models: [{ id: 'auto/coding:free' }] },
      } }, 'agent-default-model': { provider: 'freecode-omniroute', model: 'auto/coding:free' } }));
      writeFileSync(join(f.root, 'model-fallback-state.json'), JSON.stringify({
        previous: { provider: 'deepseek-free', model: 'deepseek-v3.2-free' },
        assigned: { provider: 'freecode-omniroute', model: 'auto/coding:free' },
      }));
      await retireRemovedRuntime(f.root);
      const settings = load(readFileSync(f.settings, 'utf8')) as any;
      expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'deepseek-v3.2-free' });
      expect(readFileSync(f.settings, 'utf8')).not.toContain('x-preview-f');
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });

  it('preserves manually changed defaults and an unrelated provider reusing the retired key', async () => {
    const f = fixture();
    try {
      writeFileSync(f.settings, dump({ 'llm-pi-ai': { providers: { 'freecode-omniroute': { baseURL: 'https://custom.invalid', models: [{ id: 'mine' }] } } },
        'agent-default-model': { provider: 'custom', model: 'mine' } }));
      const before = readFileSync(f.settings, 'utf8');
      await retireRemovedRuntime(f.root);
      expect(readFileSync(f.settings, 'utf8')).toBe(before);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });

  it('deletes verified app-owned caches, never follows a cache junction, and preserves sessions', async () => {
    const f = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'freecode-retire-outside-'));
    try {
      const runtime = join(f.root, 'omniroute-runtime');
      mkdirSync(runtime);
      writeFileSync(join(runtime, '.freecode-verified.json'), JSON.stringify({ version: '3.8.51', sha256: 'a'.repeat(64) }));
      mkdirSync(join(f.root, 'omniroute-data'));
      mkdirSync(join(f.home, 'sessions'));
      writeFileSync(join(f.home, 'sessions', 'keep'), 'history');
      writeFileSync(join(outside, 'keep'), 'outside');
      await retireRemovedRuntime(f.root);
      expect(existsSync(runtime)).toBe(false);
      expect(existsSync(join(f.root, 'omniroute-data'))).toBe(false);
      expect(readFileSync(join(f.home, 'sessions', 'keep'), 'utf8')).toBe('history');
      symlinkSync(outside, runtime, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(retireRemovedRuntime(f.root)).rejects.toThrow(/symlink|junction/);
      expect(readFileSync(join(outside, 'keep'), 'utf8')).toBe('outside');
    } finally { rmSync(f.root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });
});
