import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dump, load } from 'js-yaml';
import { ModelFallback, FALLBACK_MODEL, FALLBACK_PROVIDER } from '../src/main/model-fallback.js';
import { refreshModels } from '../src/main/model-refresher.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'freecode-fallback-policy-'));
  roots.push(root);
  const path = join(root, 'settings.yaml');
  const write = (selection: Record<string, unknown>) => writeFileSync(path, dump({ 'agent-default-model': selection }));
  const selected = () => (load(readFileSync(path, 'utf8')) as any)['agent-default-model'];
  write({ provider: 'deepseek-free', model: 'primary-a', reasoningEffort: 'high' });
  let now = 0;
  const policy = new ModelFallback({ homeDir: root, userDataDir: root, now: () => now });
  return { root, policy, write, selected, advance: () => { now += 30_000; } };
}

describe('verified free-only automatic fallback', () => {
  it('requires nine completed consecutive misses and at least four minutes; a primary responder resets it', () => {
    const { policy, advance } = setup();
    for (let n = 0; n < 8; n++) { expect(policy.observePrimary([])).toBe(false); advance(); }
    expect(policy.observePrimary([])).toBe(true);
    expect(policy.observePrimary(['primary-a'])).toBe(false);
    expect(policy.observePrimary([])).toBe(false);
  });

  it('does not fail over from a burst of quick manual refreshes', () => {
    const { policy } = setup();
    for (let n = 0; n < 20; n++) expect(policy.observePrimary([])).toBe(false);
  });

  it('selects only a verified exact free model, restores after restart, and preserves user changes', () => {
    const { policy, advance, selected, write, root } = setup();
    for (let n = 0; n < 9; n++) { policy.observePrimary([]); advance(); }
    expect(policy.activate([])).toBe(false);
    expect(policy.activate(['paid/model'])).toBe(false);
    expect(policy.activate([FALLBACK_MODEL])).toBe(true);
    expect(selected()).toEqual({ provider: FALLBACK_PROVIDER, model: FALLBACK_MODEL });
    const resumed = new ModelFallback({ homeDir: root, userDataDir: root });
    resumed.observePrimary(['primary-a']);
    expect(selected()).toEqual({ provider: 'deepseek-free', model: 'primary-a', reasoningEffort: 'high' });
    for (let n = 0; n < 9; n++) { policy.observePrimary([]); advance(); }
    policy.activate([FALLBACK_MODEL]);
    write({ provider: 'my-provider', model: 'mine' });
    policy.observePrimary(['primary-a']);
    expect(selected().provider).toBe('my-provider');
    expect(policy.activate([FALLBACK_MODEL])).toBe(false);
  });

  it('deduplicates notices by state rather than each refresh', () => {
    const { policy } = setup();
    expect(policy.noticeChanged('preparing')).toBe(true);
    expect(policy.noticeChanged('preparing')).toBe(false);
    expect(policy.noticeChanged('unavailable')).toBe(true);
    expect(policy.noticeChanged('unavailable')).toBe(false);
    expect(policy.noticeChanged('preparing')).toBe(false);
    policy.observePrimary([]);
    policy.observePrimary(['healthy']);
    expect(policy.noticeChanged('preparing')).toBe(true);
  });

  it('preserves an unrelated user provider even after the full recovery grace', () => {
    const { policy, advance, write, selected } = setup();
    write({ provider: 'user-choice', model: 'custom' });
    for (let n = 0; n < 9; n++) { policy.observePrimary([]); advance(); }
    expect(policy.activate([FALLBACK_MODEL])).toBe(false);
    expect(selected()).toEqual({ provider: 'user-choice', model: 'custom' });
  });

  it('rejects a non-200 catalog and never treats a configured unprobed strict route as verified', async () => {
    const { root } = setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: FALLBACK_MODEL }] }), { status: 201 })));
    await expect(refreshModels({ lbBaseUrl: 'http://primary', homeDir: root, userDataDir: root })).rejects.toThrow('201');
    const fetchImpl = vi.fn(async (url: string) => new Response(
      url.endsWith('/models') ? JSON.stringify({ data: [{ id: FALLBACK_MODEL }] }) : '',
      { status: url.endsWith('/models') ? 200 : 503 },
    ));
    vi.stubGlobal('fetch', fetchImpl);
    const catalog = await refreshModels({ lbBaseUrl: 'http://primary', homeDir: root, userDataDir: root,
      providers: [{ provider: FALLBACK_PROVIDER, baseUrl: 'http://fallback', strictResponders: true, probeModels: false }],
    });
    expect(catalog.providers[FALLBACK_PROVIDER]?.models[0]?.responds).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('probes only auto/coding:free and accepts strictly HTTP 200 responders, not 201 or advertised exceptions', async () => {
    const { root } = setup();
    const probes: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [
        { id: 'good' }, { id: 'x-preview-f' }, { id: 'not-200' }, { id: FALLBACK_MODEL }, { id: 'paid/model' },
      ] }), { status: 200 });
      const model = JSON.parse(String(options?.body)).model;
      probes.push(model);
      return new Response('{}', { status: model === 'x-preview-f' ? 503 : model === 'not-200' ? 201 : 200 });
    }));
    const catalog = await refreshModels({ lbBaseUrl: 'http://primary', homeDir: root, userDataDir: root,
      providers: [{ provider: FALLBACK_PROVIDER, baseUrl: 'http://fallback', strictResponders: true,
        exactModelIds: [FALLBACK_MODEL] }],
    });
    expect(probes.filter(id => id === FALLBACK_MODEL)).toHaveLength(2); // primary advertises it too
    expect(probes.filter(id => id === 'paid/model')).toHaveLength(1); // never probed through fallback
    expect(catalog.providers[FALLBACK_PROVIDER]?.models.map(model => model.id)).toEqual([FALLBACK_MODEL]);
    const settings = load(readFileSync(join(root, 'settings.yaml'), 'utf8')) as any;
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models.map((model: any) => model.id)).not.toContain('x-preview-f');
    expect(settings['llm-pi-ai'].providers['deepseek-free'].models.map((model: any) => model.id)).not.toContain('not-200');
  });
});
