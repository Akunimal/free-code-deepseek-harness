import { expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seedProviders } from '../src/main/provider-seeder.js';
import { refreshModels } from '../src/main/model-refresher.js';

it('updates the real running Host selector and endpoint through profile HMR without restarting it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'freecode-profile-host-'));
  const profile = join(home, 'profiles/web'); mkdirSync(profile, {recursive: true});
  writeFileSync(join(profile, 'cordis.patch.yml'), `- id: llm-pi-ai\n  name: '@deepseek-ai/dsh-llm-pi-ai'\n  config:\n    providers:\n      deepseek-free:\n        api: openai-completions\n        baseURL: http://127.0.0.1:50291/v1\n        models: [{id: x-preview-f}]\n- id: agent-default-model\n  name: '@deepseek-ai/dsh-agent-default-model'\n  config: {provider: deepseek-free, model: x-preview-f}\n`);
  seedProviders({homeDir: home, lbBaseUrl: 'http://127.0.0.1:51593/v1'});
  const proc = spawn(process.execPath, [resolve('../../vendor/deepseek-harness/apps/cli/lib/bin.js'), 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    env: {...process.env, DSH_HOME: home, FREECODE_WEB_MODE: '1', FREECODE_PUBLIC_KEY: 'public'},
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = ''; proc.stdout.on('data', b => { output += b.toString(); }); proc.stderr.on('data', b => { output += b.toString(); });
  const nativeFetch = globalThis.fetch;
  try {
    await vi.waitFor(() => {
      expect(proc.exitCode, output.slice(-2000)).toBeNull();
      expect(output).toMatch(/dsh web: http:\/\/127\.0\.0\.1:\d+\/\?\S+/);
    }, {timeout: 60_000, interval: 100});
    const printed = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?\S+)/)![1]!;
    const login = await nativeFetch(printed, {redirect: 'manual'});
    expect(login.status).toBe(303);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const base = new URL(printed).origin;
    let rpcId = 0;
    const rpc = async (method: string): Promise<any> => {
      const response = await nativeFetch(`${base}/api/${method}`, {
        method: 'POST', headers: {'content-type': 'application/json', cookie},
        body: JSON.stringify({type: 'client-request', rpcId: `profile-${++rpcId}`, method, payload: {args: {}}}),
      });
      const result = await response.json() as any;
      expect(result.result.ok, JSON.stringify(result)).toBe(true);
      return result.result.value;
    };
    const freeModels = async (): Promise<string[]> => (await rpc('session/modelCatalog')).groups
      .find((x: any) => x.id === 'deepseek-free')?.models.map((x: any) => x.id) ?? [];
    expect(await freeModels()).toEqual([]);
    let ids = ['big-pickle', 'cat-jam-free']; let succeeds = true;
    vi.stubGlobal('fetch', (async (url: string | URL | Request, init?: RequestInit) => {
      if (!String(url).startsWith('http://127.0.0.1:51593') && !String(url).startsWith('http://127.0.0.1:60001')) return nativeFetch(url, init);
      return String(url).endsWith('/models')
        ? new Response(JSON.stringify({data: ids.map(id => ({id}))}), {status: 200})
        : new Response('{}', {status: succeeds ? 200 : 403});
    }) as typeof fetch);
    const refresh = (port = 51593) => refreshModels({homeDir: home, userDataDir: join(home, 'catalog'), lbBaseUrl: `http://127.0.0.1:${port}`});
    await refresh();
    await vi.waitFor(async () => expect(await freeModels()).toEqual(ids), {timeout: 20_000, interval: 100});
    succeeds = false; await refresh();
    await vi.waitFor(async () => expect(await freeModels()).toEqual([]), {timeout: 20_000, interval: 100});
    ids = ['step-5-preview-free', 'big-pickle', 'cat-jam-free']; succeeds = true; await refresh(60001);
    await vi.waitFor(async () => expect(await freeModels()).toEqual(ids), {timeout: 20_000, interval: 100});
    const settings = await rpc('settings/describe');
    expect(settings.namespaces.find((x: any) => x.ns === 'llm-pi-ai').value.providers['deepseek-free'].baseURL).toBe('http://127.0.0.1:60001/v1');
  } finally {
    vi.unstubAllGlobals();
    if (proc.exitCode === null) { const exited = once(proc, 'exit'); proc.kill(); await exited; }
    rmSync(home, {recursive: true, force: true});
  }
}, 120_000);
