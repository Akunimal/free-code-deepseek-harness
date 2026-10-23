import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshModels } from '../src/main/model-refresher.js';
import { readHarnessSettings, writeHarnessSettings } from '../src/main/harness-settings.js';
import { seedProviders } from '../src/main/provider-seeder.js';

const roots: string[] = [];
const pinned = 'kilo/poolside/laguna-s-2.1:free';
const allowed = ['auto', pinned, 'ovh/Qwen3.5-397B-A17B'];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each([503, 400, 200, 'transport'] as const)('keeps a verified pin and its context registered through probe failure %s and recovery', async failure => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-model-recovery-')); roots.push(root);
  const cfg = { homeDir: join(root, 'home'), userDataDir: join(root, 'catalog'),
    lbBaseUrl: 'http://127.0.0.1:51987', exactModelIds: allowed, probeModels: true };
  seedProviders({ homeDir: cfg.homeDir, lbBaseUrl: cfg.lbBaseUrl, modelIds: allowed });
  let fails = false;
  let listed = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: listed
      ? allowed.map(id => ({ id, ...(id === pinned ? {
        context_window: 900_000, max_output_tokens: 64_000,
        reasoning: true, reasoning_efforts: ['high'], default_reasoning_effort: 'high',
      } : {}) })) : [] }), { status: 200 });
    const body = JSON.parse(String(init?.body)) as { model: string; tools?: unknown };
    const id = body.model;
    if (fails && id === pinned && failure === 'transport') throw new Error('test-owned connection loss');
    if (body.tools !== undefined) {
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'freecode_ping', arguments: '{}' } }] } }] }),
      { status: fails && id === pinned && typeof failure === 'number' ? failure : 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant',
      content: fails && id === pinned && failure === 200 ? '' : 'pong' } }] }),
    { status: fails && id === pinned && typeof failure === 'number' ? failure : 200 });
  }));
  await refreshModels(cfg);
  let settings = readHarnessSettings(cfg.homeDir);
  settings['agent-default-model'] = { provider: 'freecode-phoenix', model: pinned };
  settings['llm-pi-ai'].providers['freecode-phoenix'].models.push({ id: 'retired-route' });
  writeHarnessSettings(cfg.homeDir, settings);
  const descriptor = settings['llm-pi-ai'].providers['freecode-phoenix'].models.find((m: { id: string }) => m.id === pinned);
  expect(descriptor.contextWindow).toBe(900_000);
  expect(descriptor).toMatchObject({ reasoningEfforts: { off: null, high: 'high' }, defaultReasoningEffort: 'high' });

  fails = true;
  const failed = await refreshModels(cfg);
  expect(failed.providers['freecode-phoenix']!.models.find(m => m.id === pinned)).toMatchObject({ responds: false });
  settings = readHarnessSettings(cfg.homeDir);
  let models = settings['llm-pi-ai'].providers['freecode-phoenix'].models;
  expect(models.map((m: { id: string }) => m.id)).toEqual(allowed);
  expect(models.find((m: { id: string }) => m.id === pinned)).toEqual({ ...descriptor, selectable: false });
  expect(models.filter((m: { selectable?: boolean }) => m.selectable !== false).map((m: { id: string }) => m.id))
    .toEqual(['auto', 'ovh/Qwen3.5-397B-A17B']);
  expect(settings['agent-default-model']).toEqual({ provider: 'freecode-phoenix', model: pinned });

  listed = false;
  await refreshModels(cfg);
  settings = readHarnessSettings(cfg.homeDir);
  expect(settings['llm-pi-ai'].providers['freecode-phoenix'].models.find((m: { id: string }) => m.id === pinned))
    .toEqual({ ...descriptor, selectable: false });
  expect(settings['agent-default-model'].model).toBe(pinned);

  listed = true; fails = false;
  await refreshModels(cfg);
  settings = readHarnessSettings(cfg.homeDir);
  models = settings['llm-pi-ai'].providers['freecode-phoenix'].models;
  expect(models.find((m: { id: string }) => m.id === pinned)).toEqual(descriptor);
  expect(settings['agent-default-model'].model).toBe(pinned);
});

it('starts with exact routes registered but no unverified selector choice', () => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-model-seed-')); roots.push(root);
  seedProviders({ homeDir: root, lbBaseUrl: 'http://127.0.0.1:51987', modelIds: allowed });
  const models = readHarnessSettings(root)['llm-pi-ai'].providers['freecode-phoenix'].models;
  expect(models).toEqual(allowed.map(id => ({ id, selectable: false })));
});
