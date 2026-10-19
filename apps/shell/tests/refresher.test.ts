import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readHarnessSettings } from '../src/main/harness-settings.js';
import {
  refreshModels,
  ModelCatalog,
  shouldRetryModelRefresh,
} from '../src/main/model-refresher.js';

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
  it('uses the minimum accepted output budget for upstream health probes', async () => {
    const { home, data } = tmpDirs();
    const probeBodies: Array<{ model: string; max_tokens: number }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const endpoint = String(url);
      if (endpoint.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'muse-spark-1.3-contributor-free' }] }), { status: 200 });
      }
      if (endpoint.endsWith('/v1/chat/completions')) {
        probeBodies.push(JSON.parse(String(init?.body)) as { model: string; max_tokens: number });
        return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    try {
      await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      expect(probeBodies).toHaveLength(1);
      expect(probeBodies[0]).toMatchObject({ model: 'muse-spark-1.3-contributor-free', max_tokens: 16 });
    } finally {
      rmSync(dirname(home), { recursive: true, force: true });
    }
  });

  it('ignores malformed entries in an otherwise valid model catalog', async () => {
    const { home, data } = tmpDirs();
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const endpoint = String(url);
      if (endpoint.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [null, 'invalid', { id: 'valid-model' }] }), { status: 200 });
      }
      if (endpoint.endsWith('/v1/chat/completions')) {
        return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    try {
      const catalog = await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      expect(catalog.providers['deepseek-free']?.models.map((model) => model.id)).toEqual(['valid-model']);
    } finally {
      rmSync(dirname(home), { recursive: true, force: true });
    }
  });

  it.each([
    ['empty route list', [], true],
    ['transport failure despite another responder', [
      { id: 'online', responds: true, latencyMs: 1, lastSeen: 1 },
      { id: 'flaky', responds: false, latencyMs: null, lastSeen: 1, failureKind: 'transport' },
    ], true],
    ['HTTP 408', [{ id: 'slow', responds: false, latencyMs: 1, lastSeen: 1, failureKind: 'http', statusCode: 408 }], true],
    ['HTTP 429', [{ id: 'limited', responds: false, latencyMs: 1, lastSeen: 1, failureKind: 'http', statusCode: 429 }], true],
    ['HTTP 5xx', [{ id: 'gateway', responds: false, latencyMs: 1, lastSeen: 1, failureKind: 'http', statusCode: 503 }], true],
    ['permanent unsupported-protocol HTTP 400', [{ id: 'unsupported', responds: false, latencyMs: 1, lastSeen: 1, failureKind: 'http', statusCode: 400 }], false],
    ['permanent auth HTTP 401', [{ id: 'unauthorized', responds: false, latencyMs: 1, lastSeen: 1, failureKind: 'http', statusCode: 401 }], false],
    ['ready catalog', [{ id: 'online', responds: true, latencyMs: 1, lastSeen: 1 }], false],
  ])('retry policy: %s', (_name, models, expected) => {
    const catalog = {
      refreshedAt: 1,
      providers: { 'deepseek-free': { models } },
    } as ModelCatalog;
    expect(shouldRetryModelRefresh(catalog)).toBe(expected);
  });

  it('marks partial transient probe failures degraded while keeping verified routes selectable', async () => {
    const { home, data } = tmpDirs();
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const endpoint = String(url);
      if (endpoint.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'verified' }, { id: 'temporarily-offline' }] }), { status: 200 });
      }
      if (endpoint.endsWith('/v1/chat/completions')) {
        const { model } = JSON.parse(String(init?.body)) as { model: string };
        if (model === 'temporarily-offline') throw new TypeError('socket hang up');
        return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    try {
      const catalog = await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      expect(catalog.availability).toBe('degraded');
      expect(shouldRetryModelRefresh(catalog)).toBe(true);
      expect(catalog.providers['deepseek-free']!.models).toEqual([
        expect.objectContaining({ id: 'verified', responds: true }),
        expect.objectContaining({ id: 'temporarily-offline', failureKind: 'transport' }),
      ]);
      const settings = readHarnessSettings(home);
      expect(settings['llm-pi-ai'].providers['deepseek-free'].models.map((model: { id: string }) => model.id))
        .toEqual(['verified']);
    } finally {
      rmSync(dirname(home), { recursive: true, force: true });
    }
  });

  afterEach(() => vi.unstubAllGlobals());

  it('probes models, persists catalog with latency, syncs settings with responders sorted', async () => {
    // Keep a wide margin so the latency-order assertion is not inverted by
    // Windows timer jitter when Vitest runs the full suite in parallel.
    mockFetch(['deepseek-v3.2-free', 'deepseek-chat'], {
      'deepseek-v3.2-free': 50,
      'deepseek-chat': 300,
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
    const settings = readHarnessSettings(home);
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      deepseekModel('deepseek-v3.2-free'),
      deepseekModel('deepseek-chat'),
    ]);
    expect(updated).not.toBeNull();
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('orders active-profile models by latency asc (fastest first = de-facto default)', async () => {
    mockFetch(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3.2-free'], {
      'deepseek-chat': 400,
      'deepseek-v3.2-free': 50,
      'deepseek-reasoner': 200,
    });
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
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

  it('merges into the active profile without touching other user sections', async () => {
    mockFetch(['deepseek-chat', 'deepseek-v3.2-free'], { 'deepseek-v3.2-free': 50, 'deepseek-chat': 300 });
    const { home, data } = tmpDirs();
    // A user section (e.g. OmniRoute added via wizard) must survive the merge.
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, 'settings.yaml'),
      `llm-pi-ai:\n  providers:\n    omniroute:\n      displayName: OmniRoute\n      api: openai-completions\n      baseURL: http://127.0.0.1:8080/v1\n      models:\n        - id: route-model\n`,
    );
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
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
    const settings = readHarnessSettings(home);
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      { id: 'x-preview-f', reasoningEfforts: false },
      deepseekModel('deepseek-v3.2-free'),
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('chooses the first verified route when migration left no default yet', async () => {
    mockFetchWithModels(['deepseek-v3.2-free'], ['deepseek-v3.2-free']);
    const { home, data } = tmpDirs();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'settings.yaml'), 'llm-pi-ai:\n  providers:\n    deepseek-free:\n      models: []\n');
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
    expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'deepseek-v3.2-free' });
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('prefers deepseek-v4.1-flash-free as the default when it responds', async () => {
    mockFetchWithModels(['other-free', 'deepseek-v4.1-flash-free'], ['other-free', 'deepseek-v4.1-flash-free']);
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
    expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'deepseek-v4.1-flash-free' });
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('falls back to a fastest responder when the preferred default is not served', async () => {
    mockFetchWithModels(['only-model'], ['only-model']);
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
    expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'only-model' });
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('refreshes MiMo models with binary thinking and no reasoning_effort support', async () => {
    mockFetchWithModels(['mimo-v2.5-pro'], ['mimo-v2.5-pro']);
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([{
      id: 'mimo-v2.5-pro',
      reasoningEfforts: { off: null, high: 'high' },
      compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: false },
    }]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('does not expose x-preview-f until its slow probe actually responds 200', async () => {
    mockFetchWithModels(['x-preview-f', 'deepseek-v3.2-free'], ['deepseek-v3.2-free']);
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual(
      [deepseekModel('deepseek-v3.2-free')],
    );
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('keeps unverified gateway IDs out of routable settings until a slow probe returns 200', async () => {
    const { home, data } = tmpDirs();
    const { mkdirSync, readFileSync: readFile, writeFileSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'settings.yaml'), `llm-pi-ai:\n  providers:\n    deepseek-free:\n      models: []\nagent-default-model:\n  provider: deepseek-free\n  model: x-preview-f\n`);
    let releaseProbe!: () => void;
    let probeStarted = false;
    const gate = new Promise<void>((resolve) => { releaseProbe = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'slow-supported-model' }] }), { status: 200 });
      }
      if (String(url).endsWith('/v1/chat/completions')) {
        probeStarted = true;
        await gate;
        return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    const refresh = refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    try {
      await vi.waitFor(() => {
        expect(probeStarted).toBe(true);
        const settings = readHarnessSettings(home);
        expect(settings['llm-pi-ai'].providers['deepseek-free'].models)
          .toEqual([]);
        expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'x-preview-f' });
      }, { timeout: 250 });
    } finally {
      releaseProbe();
    }
    const catalog = await refresh;
    expect(catalog.providers['deepseek-free']!.models[0]).toMatchObject({ id: 'slow-supported-model', responds: true });
    const settings = readHarnessSettings(home);
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models)
      .toEqual([{ id: 'slow-supported-model', reasoningEfforts: false }]);
    expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'slow-supported-model' });
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('removes a gateway model that returns the exact unsupported-protocol 400', async () => {
    const { home, data } = tmpDirs();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'settings.yaml'), `llm-pi-ai:\n  providers:\n    deepseek-free:\n      models:\n        - id: x-preview-f\n`);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'x-preview-f' }] }), { status: 200 });
      }
      if (String(url).endsWith('/v1/chat/completions')) {
        return new Response(JSON.stringify({
          error: {
            code: null,
            message: 'the model uses an upstream protocol that opencode2api does not expose',
            param: null,
            type: 'invalid_request_error',
          },
        }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }));

    const catalog = await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    expect(catalog.providers['deepseek-free']!.models[0]).toMatchObject({
      id: 'x-preview-f',
      responds: false,
      failureKind: 'http',
      statusCode: 400,
    });
    expect(catalog.lastKnownGoodByProvider?.['deepseek-free']).toEqual([]);
    const settings = readHarnessSettings(home);
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeUndefined();
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('retains only previously verified models across transport failures and evicts explicit HTTP rejections', async () => {
    const { home, data } = tmpDirs();
    let phase: 'initial' | 'transport-down' | 'recovered' = 'initial';
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const endpoint = String(url);
      if (endpoint.endsWith('/v1/models')) {
        const data = phase === 'initial'
          ? ['known-good', 'will-be-rejected']
          : ['known-good', 'new-candidate', 'will-be-rejected'];
        return new Response(JSON.stringify({ data: data.map((id) => ({ id })) }), { status: 200 });
      }
      if (endpoint.endsWith('/v1/chat/completions')) {
        const { model } = JSON.parse(String(init?.body)) as { model: string };
        if (phase === 'initial') {
          return new Response(JSON.stringify({ choices: [] }), { status: 200 });
        }
        if (phase === 'transport-down') {
          if (model === 'will-be-rejected') {
            return new Response(JSON.stringify({
              error: {
                code: null,
                message: 'the model uses an upstream protocol that opencode2api does not expose',
                param: null,
                type: 'invalid_request_error',
              },
            }), { status: 400, headers: { 'content-type': 'application/json' } });
          }
          throw new TypeError('socket hang up');
        }
        if (model === 'will-be-rejected') {
          return new Response('unsupported', { status: 400 });
        }
        return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const first = await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      expect(first.providers['deepseek-free']!.models.map((model) => model.id)).toEqual([
        'known-good', 'will-be-rejected',
      ]);
      expect(first.lastKnownGoodByProvider?.['deepseek-free']).toEqual([
        'known-good', 'will-be-rejected',
      ]);
      // Upgrade catalogs created before the durable last-known-good field.
      writeFileSync(join(data, 'model-catalog.json'), JSON.stringify({
        refreshedAt: 1,
        availability: 'ready',
        providers: {
          'deepseek-free': {
            models: [
              { id: 'known-good', responds: true, latencyMs: 1, lastSeen: 1 },
              { id: 'will-be-rejected', responds: true, latencyMs: 1, lastSeen: 1 },
            ],
          },
        },
      }));

      phase = 'transport-down';
      const degraded = await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      expect(degraded.availability).toBe('degraded');
      expect(degraded.providers['deepseek-free']!.models).toEqual([
        expect.objectContaining({ id: 'known-good', responds: false, failureKind: 'transport', lastKnownGood: true }),
        expect.objectContaining({ id: 'new-candidate', responds: false, failureKind: 'transport' }),
        expect.objectContaining({ id: 'will-be-rejected', responds: false, failureKind: 'http', statusCode: 400 }),
      ]);
      expect(degraded.lastKnownGoodByProvider?.['deepseek-free']).toEqual(['known-good']);
      let settings = readHarnessSettings(home);
      expect(settings['llm-pi-ai'].providers['deepseek-free'].models.map((model: { id: string }) => model.id))
        .toEqual(['known-good']);
      expect(settings['agent-default-model']).toEqual({ provider: 'deepseek-free', model: 'known-good' });

      const repeatedFailure = await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      expect(repeatedFailure.lastKnownGoodByProvider?.['deepseek-free']).toEqual(['known-good']);
      settings = readHarnessSettings(home);
      expect(settings['llm-pi-ai'].providers['deepseek-free'].models.map((model: { id: string }) => model.id))
        .toEqual(['known-good']);

      phase = 'recovered';
      const recovered = await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      expect(recovered.availability).toBe('ready');
      expect(recovered.providers['deepseek-free']!.models).toEqual([
        expect.objectContaining({ id: 'known-good', responds: true }),
        expect.objectContaining({ id: 'new-candidate', responds: true }),
        expect.objectContaining({ id: 'will-be-rejected', responds: false, failureKind: 'http', statusCode: 400 }),
      ]);
      expect(recovered.lastKnownGoodByProvider?.['deepseek-free']).toEqual(['known-good', 'new-candidate']);
      settings = readHarnessSettings(home);
      expect(settings['llm-pi-ai'].providers['deepseek-free'].models.map((model: { id: string }) => model.id))
        .toEqual(['known-good', 'new-candidate']);
    } finally {
      rmSync(dirname(home), { recursive: true, force: true });
    }
  });

  it('syncs optional no-auth providers with their own credential and input shape', async () => {
    mockFetchWithModels(['deepseek-v4-flash-free'], ['deepseek-v4-flash-free']);
    const { home, data } = tmpDirs();
    await refreshModels({
      lbBaseUrl: LB,
      homeDir: home,
      userDataDir: data,
      providers: [
        {
          provider: 'opencode-free',
          baseUrl: 'http://127.0.0.1:45678',
          authHeader: 'Bearer public',
          apiKeyEnv: 'FREECODE_PUBLIC_KEY',
          defaultInput: ['text'],
          probeModels: false,
          fallbackModels: ['deepseek-v4-flash-free'],
        },
      ],
    });
    const settings = readHarnessSettings(home);
    const p = settings['llm-pi-ai'].providers['opencode-free'];
    expect(p.api).toBe('openai-completions');
    expect(p.baseURL).toBe('http://127.0.0.1:45678/v1');
    expect(p.apiKeyEnv).toBe('FREECODE_PUBLIC_KEY');
    expect(p.defaultInput).toEqual(['text']);
    expect(p.models).toEqual([
      {
        ...deepseekModel('deepseek-v4-flash-free'),
        contextWindow: 1_048_576,
        outputMaxTokens: 393_216,
      },
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('strict lane exposes only 200 responders, never the advertised catalog', async () => {
    mockFetchWithModels(['a-free', 'b-free'], ['b-free']);
    const { home, data } = tmpDirs();
    await refreshModels({
      lbBaseUrl: LB,
      homeDir: home,
      userDataDir: data,
      providers: [
        {
          provider: 'opencode-free',
          baseUrl: 'http://127.0.0.1:45678',
          authHeader: 'Bearer public',
          apiKeyEnv: 'FREECODE_PUBLIC_KEY',
          defaultInput: ['text'],
          strictResponders: true,
        },
      ],
    });
    const settings = readHarnessSettings(home);
    // a-free advertised but 500: hidden. b-free answered 200: exposed.
    expect(settings['llm-pi-ai'].providers['opencode-free'].models).toEqual([
      { id: 'b-free', reasoningEfforts: false },
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('strict lane erases stale models when nothing responds', async () => {
    mockFetchWithModels(['a-free'], []);
    const { home, data } = tmpDirs();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, 'settings.yaml'),
      `llm-pi-ai:\n  providers:\n    opencode-free:\n      api: openai-completions\n      baseURL: http://127.0.0.1:45678/v1\n      models:\n        - id: stale-model\n`,
    );
    await refreshModels({
      lbBaseUrl: LB,
      homeDir: home,
      userDataDir: data,
      providers: [
        {
          provider: 'opencode-free',
          baseUrl: 'http://127.0.0.1:45678',
          authHeader: 'Bearer public',
          apiKeyEnv: 'FREECODE_PUBLIC_KEY',
          defaultInput: ['text'],
          strictResponders: true,
        },
      ],
    });
    const settings = readHarnessSettings(home);
    // Zero responders: stale entries erased instead of kept as last-known-good.
    expect(settings['llm-pi-ai'].providers['opencode-free'].models).toEqual([]);
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

  it('offers generic effort to gateway-advertised reasoning models', async () => {
    mockFetchWithModels(['space-bunny-free', 'jev-1.13-free'], ['space-bunny-free', 'jev-1.13-free']);
    const { home, data } = tmpDirs();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(data, 'opencode2api'), { recursive: true });
    writeFileSync(
      join(data, 'opencode2api', 'config.json.models.catalog.json'),
      JSON.stringify({
        metadata: { zen: { 'space-bunny-free': { reasoning: true }, 'jev-1.13-free': {} } },
      }),
    );
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
    const models = settings['llm-pi-ai'].providers['deepseek-free'].models;
    expect(models).toContainEqual({ id: 'space-bunny-free', reasoningEfforts: { off: null, low: 'low', high: 'high' } });
    expect(models).toContainEqual({ id: 'jev-1.13-free', reasoningEfforts: false });
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('prefers the free zen lane over other lanes advertising the same id', async () => {
    mockFetchWithModels(['shared-free'], ['shared-free']);
    const { home, data } = tmpDirs();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(data, 'opencode2api'), { recursive: true });
    writeFileSync(
      join(data, 'opencode2api', 'config.json.models.catalog.json'),
      JSON.stringify({ metadata: {
        go: { 'shared-free': { context_window: 1_000_000, max_output: 100_000 } },
        zen: { 'shared-free': { context_window: 200_000, max_output: 32_000 } },
      } }),
    );
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const models = readHarnessSettings(home)['llm-pi-ai'].providers['deepseek-free'].models;
    expect(models).toContainEqual(expect.objectContaining({ id: 'shared-free', contextWindow: 200_000, outputMaxTokens: 32_000 }));
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('carries gateway-declared context, output capability, supported efforts and defaults into each route', async () => {
    const { home, data } = tmpDirs();
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const endpoint = String(url);
      if (endpoint.endsWith('/v1/models')) return new Response(JSON.stringify({ data: [
        {
          id: 'deepseek-v4-flash',
          context_window: 1_048_576,
          max_output: 393_216,
          reasoning: true,
          reasoning_efforts: ['low', 'medium', 'high', 'max'],
          default_reasoning_effort: 'high',
        },
        {
          id: 'catalog-small-reasoner',
          metadata: { context_window: 48_000, max_output: 6_000, reasoning: true },
          reasoning_efforts: ['minimal', 'high'],
          default_reasoning_effort: 'minimal',
        },
      ] }), { status: 200 });
      if (endpoint.endsWith('/v1/chat/completions')) return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      return new Response('not found', { status: 404 });
    }));

    try {
      await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      const models = readHarnessSettings(home)['llm-pi-ai'].providers['deepseek-free'].models;
      expect(models).toContainEqual({
        id: 'deepseek-v4-flash',
        contextWindow: 1_048_576,
        outputMaxTokens: 393_216,
        reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high', max: 'max' },
        defaultReasoningEffort: 'high',
      });
      expect(models).toContainEqual({
        id: 'catalog-small-reasoner',
        contextWindow: 48_000,
        outputMaxTokens: 6_000,
        reasoningEfforts: { off: null, minimal: 'minimal', high: 'high' },
        defaultReasoningEffort: 'minimal',
      });
    } finally {
      rmSync(dirname(home), { recursive: true, force: true });
    }
  });

  it('uses the verified 1M context and V4 efforts (no fabricated default) only for an unambiguous DeepSeek V4 id', async () => {
    const { home, data } = tmpDirs();
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const endpoint = String(url);
      if (endpoint.endsWith('/v1/models')) return new Response(JSON.stringify({ data: [
        { id: 'deepseek-v4-pro' },
        { id: 'other-v4-provider-model' },
      ] }), { status: 200 });
      if (endpoint.endsWith('/v1/chat/completions')) return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      return new Response('not found', { status: 404 });
    }));

    try {
      await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      const models = readHarnessSettings(home)['llm-pi-ai'].providers['deepseek-free'].models;
      expect(models).toContainEqual({
        id: 'deepseek-v4-pro',
        contextWindow: 1_048_576,
        outputMaxTokens: 393_216,
        reasoningEfforts: { off: null, low: 'low', high: 'high', max: 'max' },
      });
      expect(models).toContainEqual({ id: 'other-v4-provider-model', reasoningEfforts: false });
    } finally {
      rmSync(dirname(home), { recursive: true, force: true });
    }
  });

  it('ignores malformed capability values and lets valid upstream metadata override the V4 fallback', async () => {
    const { home, data } = tmpDirs();
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const endpoint = String(url);
      if (endpoint.endsWith('/v1/models')) return new Response(JSON.stringify({ data: [
        {
          id: 'deepseek-v4-flash',
          context_window: 524_288,
          max_output: 'not-a-number',
          reasoning: true,
          reasoning_efforts: ['low', 'high'],
          default_reasoning_effort: 'low',
        },
        { id: 'custom-model', context_window: '1048576', max_output: -4, reasoning_efforts: ['admin'] },
      ] }), { status: 200 });
      if (endpoint.endsWith('/v1/chat/completions')) return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      return new Response('not found', { status: 404 });
    }));

    try {
      await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
      const models = readHarnessSettings(home)['llm-pi-ai'].providers['deepseek-free'].models;
      expect(models).toContainEqual({
        id: 'deepseek-v4-flash',
        contextWindow: 524_288,
        outputMaxTokens: 393_216,
        reasoningEfforts: { off: null, low: 'low', high: 'high' },
        defaultReasoningEffort: 'low',
      });
      expect(models).toContainEqual({ id: 'custom-model', reasoningEfforts: false });
    } finally {
      rmSync(dirname(home), { recursive: true, force: true });
    }
  });

  it('falls back to name policy when gateway metadata is absent', async () => {
    mockFetchWithModels(['space-bunny-free'], ['space-bunny-free']);
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = readHarnessSettings(home);
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      { id: 'space-bunny-free', reasoningEfforts: false },
    ]);
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('erases the anonymous lane when no model answers 200 (strict 200-only)', async () => {
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
    const settings = readHarnessSettings(home);
    // 0.9.1: stale entries are erased instead of kept as last-known-good,
    // so the selector never offers dead models. Bounded refresh retries
    // repopulate the lane on upstream recovery.
    expect(settings['llm-pi-ai'].providers['deepseek-free']).toBeUndefined();
    rmSync(dirname(home), { recursive: true, force: true });
  });
});
