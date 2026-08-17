import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { refreshModels, ModelCatalog } from '../src/main/model-refresher.js';

const LB = 'http://127.0.0.1:41234';

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
        await new Promise((r) => setTimeout(r, latencies[body.model] ?? 20));
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
    expect(catalog.providers['deepseek-free'].models).toHaveLength(3);
    const reasoner = catalog.providers['deepseek-free'].models.find((m) => m.id === 'deepseek-reasoner')!;
    expect(reasoner.responds).toBe(false);

    // settings.yaml syncs only responders.
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models).toEqual([
      'deepseek-v3.2-free',
      'deepseek-chat',
    ]);
    expect(updated).not.toBeNull();
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('auto-picks default model = best latency responder', async () => {
    mockFetch(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3.2-free'], 10);
    const { home, data } = tmpDirs();
    await refreshModels({ lbBaseUrl: LB, homeDir: home, userDataDir: data });
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].defaultModel).toBe('deepseek-chat');
    rmSync(dirname(home), { recursive: true, force: true });
  });

  it('does NOT override default when user picked one manually', async () => {
    mockFetch(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3.2-free'], 10);
    const { home, data } = tmpDirs();
    // User already picked a model in settings.yaml.
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, 'settings.yaml'),
      `llm-pi-ai:\n  defaultModel: deepseek-reasoner\n  providers:\n    deepseek-free:\n      api: openai-completions\n      baseURL: ${LB}\n      models: []\n`,
    );
    await refreshModels({
      lbBaseUrl: LB,
      homeDir: home,
      userDataDir: data,
      isDefaultPicked: () => existsSync(join(data, '.user-picked-default')),
    });
    const settings = loadYaml(readFileSync(join(home, 'settings.yaml'), 'utf8')) as any;
    // defaultModel preserved even though reasoner responds (marker absent but
    // a non-responding default also keeps: reasoner responds here, yet the
    // rule is "user picked" -> no override when marker present; without
    // marker, current default that still responds is kept).
    expect(settings['llm-pi-ai'].defaultModel).toBe('deepseek-reasoner');
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
});