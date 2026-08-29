import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { refreshModels, ModelCatalog } from '../src/main/model-refresher.js';

const LB = 'http://127.0.0.1:41234';
const REASONING_EFFORTS = { off: null, low: 'low', high: 'high', max: 'max' };

function deepseekModel(id: string): { id: string; reasoningEfforts: typeof REASONING_EFFORTS } {
  return { id, reasoningEfforts: REASONING_EFFORTS };
}

function tmpDirs(): { home: string; data: string } {
  const base = mkdtempSync(join(tmpdir(), 'dsh-refresh-test-'));
  return { home: join(base, 'home'), data: join(base, 'data') };
}

function mockFetch(okIds: string[], latencies: Record<string, number> = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/v1/models')) {
        return new Response(
          JSON.stringify({
            data: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3.2-free'].map((id) => ({ id })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (u.endsWith('/v1/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as { model: string };
        const latency = latencies[body.model] ?? 20;
        await new Promise((r) => setTimeout(r, latency));
        return okIds.includes(body.model)
          ? new Response(JSON.stringify({ choices: [] }), { status: 200 })
          : new Response('err', { status: 500 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function mockFetchWithModels(modelIds: string[], okIds: string[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: modelIds.map((id) => ({ id })) }), { status: 200 });
      }
      if (u.endsWith('/v1/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as { model: string };
        return okIds.includes(body.model)
          ? new Response(JSON.stringify({ choices: [] }), { status: 200 })
          : new Response('err', { status: 500 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

describe('model-refresher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('probes models, persists catalog with latency, syncs settings with responders sorted', async () => {
    mockFetch(['deepseek-v3.2-free', 'deepseek-chat'], {
      'deepseek-v3.2-free': 5,
      'deepseek-chat': 30,
    }); // reasoner fails
    const { home, data } = tmpDirs();
    let updated: ModelCatalog | null = null;
    const catalog = await refreshModels({
      lbBaseUrl: LB,
      homeDir: home,
      userDataDir: data,
      onUpdate: (c) => (updated = c),
    });

    // Catalog keeps all models incl. non-responders.
    const freeProvider = catalog.providers['deepseek-free']!;
    expect(freeProvider.models).toHaveLength(3);
    const reasoner = freeProvider.models.find((m) => m.id === 'deepseek-reasoner')!;
    expect(reasoner.responds).toBe(false);

    // settings.yaml syncs only responders, as schema-valid model objects.
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      deepseekModel('deepseek-v3.2-free'),
      deepseekModel('deepseek-chat'),
    ]);
    expect(updated).not.toBeNull();
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('orders settings.yaml models by latency asc (fastest first = de-facto default)', async () => {
    mockFetch(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3.2-free'], {
      'deepseek-chat': 90,
      'deepseek-v3.2-free': 5,
      'deepseek-reasoner': 40,
    });
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    // Upstream has no defaultModel key (schema = {providers}); the harness UI
    // preselects the first model in the list, so the fastest responder leads.
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      deepseekModel('deepseek-v3.2-free'),
      deepseekModel('deepseek-reasoner'),
      deepseekModel('deepseek-chat'),
    ]);
    expect(settings['llm-pi-ai'].defaultModel).toBeUndefined();
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('merges into settings.yaml without touching other user sections', async () => {
    mockFetch(['deepseek-chat', 'deepseek-v3.2-free'], { 'deepseek-v3.2-free': 5, 'deepseek-chat': 30 });
    const { home, data } = tmpDirs();
    // A user section (e.g. OmniRoute added via wizard) must survive the merge.
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, 'settings.yaml'),
      `llm-pi-ai:\n  providers:\n    omniroute:\n      displayName: OmniRoute\n      api: openai-completions\n      baseURL: http://127.0.0.1:8080/v1\n      models:\n        - id: route-model\n`,
    );
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    // User route untouched...
    expect(settings['llm-pi-ai'].providers['omniroute'].baseURL).toBe('http://127.0.0.1:8080/v1');
    // ...and deepseek-free was added with responders (objects, not strings).
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      deepseekModel('deepseek-v3.2-free'),
      deepseekModel('deepseek-chat'),
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('marks non-DeepSeek models as non-reasoning instead of inheriting an effort', async () => {
    mockFetchWithModels(['x-preview-f', 'deepseek-v3.2-free'], ['x-preview-f', 'deepseek-v3.2-free']);
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      { id: 'x-preview-f', reasoningEfforts: false },
      deepseekModel('deepseek-v3.2-free'),
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('keeps x-preview-f exposed when its slow probe is temporarily unavailable', async () => {
    mockFetchWithModels(['x-preview-f', 'deepseek-v3.2-free'], ['deepseek-v3.2-free']);
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual(
      expect.arrayContaining([deepseekModel('deepseek-v3.2-free'), { id: 'x-preview-f', reasoningEfforts: false }]),
    );
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('refreshes an optional static provider without probing every model', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push(`${init?.method ?? 'GET'} ${u}`);
        if (u === `${LB}/v1/models`) {
          return new Response(JSON.stringify({ data: [{ id: 'deepseek-v3.2-free' }] }), { status: 200 });
        }
        if (u === `${LB}/v1/chat/completions`) {
          return new Response(JSON.stringify({ choices: [] }), { status: 200 });
        }
        if (u === 'http://127.0.0.1:8081/v1/models') {
          return new Response(JSON.stringify({ data: [
            { id: 'gemini-3.7-flash' },
            { id: 'gemini-3.1-pro' },
          ] }), { status: 200 });
        }
        return new Response('not found', { status: 404 });
      }),
    );
    const { home, data } = tmpDirs();
    const catalog = await refreshModels({
      lbBaseUrl: LB,
      homeDir: home,
      userDataDir: data,
      providers: [{
        provider: 'gemini-web',
        baseUrl: 'http://127.0.0.1:8081',
        probeModels: false,
        fallbackModels: ['gemini-3.7-flash'],
      }],
    });

    expect(catalog.providers['gemini-web']?.models).toEqual([
      { id: 'gemini-3.7-flash', responds: true, latencyMs: null, lastSeen: expect.any(Number) },
      { id: 'gemini-3.1-pro', responds: true, latencyMs: null, lastSeen: expect.any(Number) },
    ]);
    expect(calls).not.toContain('POST http://127.0.0.1:8081/v1/chat/completions');
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['gemini-web'].models).toEqual([
      { id: 'gemini-3.7-flash', reasoningEfforts: false },
      { id: 'gemini-3.1-pro', reasoningEfforts: false },
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('keeps the optional provider seed when its local server is offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u === `${LB}/v1/models`) {
          return new Response(JSON.stringify({ data: [{ id: 'deepseek-v3.2-free' }] }), { status: 200 });
        }
        if (u === `${LB}/v1/chat/completions`) {
          return new Response(JSON.stringify({ choices: [] }), { status: 200 });
        }
        if (u === 'http://127.0.0.1:8081/v1/models') {
          return new Response('offline', { status: 503 });
        }
        void init;
        return new Response('not found', { status: 404 });
      }),
    );
    const { home, data } = tmpDirs();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, 'settings.yaml'),
      `llm-pi-ai:\n  providers:\n    gemini-web:\n      models:\n        - id: gemini-3.6-flash\n`,
    );
    const catalog = await refreshModels({
      lbBaseUrl: LB,
      homeDir: home,
      userDataDir: data,
      providers: [{
        provider: 'gemini-web',
        baseUrl: 'http://127.0.0.1:8081',
        probeModels: false,
        fallbackModels: ['gemini-3.7-flash'],
      }],
    });
    expect(catalog.providers['gemini-web']?.models).toEqual([]);
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['gemini-web'].models).toEqual([
      { id: 'gemini-3.6-flash' },
      { id: 'gemini-3.7-flash', reasoningEfforts: false },
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('throws when LB models list fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('err', { status: 503 })),
    );
    const { home, data } = tmpDirs();
    await expect(
      refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data }),
    ).rejects.toThrow(/models list failed/);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('keeps the last known-good settings when every catalog probe is degraded', async () => {
    const { home, data } = tmpDirs();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, 'settings.yaml'),
      `llm-pi-ai:\n  providers:\n    deepseek-free:\n      models:\n        - id: last-known-good\n`,
    );
    mockFetchWithModels(['x-preview-f', 'deepseek-v3.2-free'], []);

    const catalog = await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    expect(catalog.availability).toBe('degraded');
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      { id: 'last-known-good' },
      { id: 'x-preview-f', reasoningEfforts: false },
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });
});
