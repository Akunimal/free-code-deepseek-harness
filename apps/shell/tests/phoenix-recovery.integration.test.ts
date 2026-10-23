import { expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchHidden } from '../src/main/freecode-launcher.js';
import { refreshModels } from '../src/main/model-refresher.js';
import { seedProviders } from '../src/main/provider-seeder.js';

it('continues the same real Host turn after a tool call when refresh hides its model, then restores selection', async () => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-pin-host-'));
  const runtimeRoot = resolve('resources/freecode/dsh');
  const cli = join(runtimeRoot, 'apps/cli/lib/bin.js');
  expect(existsSync(cli), 'package:runtime must complete before this staged Host test').toBe(true);
  expect(readFileSync(join(runtimeRoot, 'packages/llm/llm-pi-ai/lib/index.js'), 'utf8'))
    .toContain('hiddenModelIds');
  const executable = process.platform === 'win32' ? resolve('node_modules/electron/dist/electron.exe') : process.execPath;
  expect(existsSync(executable), 'the packaged Electron ABI is required for the Host proof').toBe(true);
  const pinned = 'kilo/poolside/laguna-s-2.1:free';
  const modelIds = ['auto', pinned];
  let failing = false;
  const generations: Array<{ model: string; messages: Array<{ role: string; tool_call_id?: string; content?: string }>; tools: Array<{ function: { name: string } }> }> = [];
  let held: ServerResponse | undefined;
  const sse = (response: ServerResponse, delta: object, finish: string) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`
      + `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 25, completion_tokens: 5 } })}\n\n`
      + 'data: [DONE]\n\n');
  };
  const upstream = createServer((request, response) => {
    if (request.url?.endsWith('/models')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: modelIds.map(id => ({ id, context_window: id === pinned ? 1_000_000 : 32_768 })) }));
      return;
    }
    let raw = '';
    request.on('data', chunk => { raw += String(chunk); });
    request.on('end', () => {
      const body = JSON.parse(raw);
      if (body.stream === false) {
        response.writeHead(failing ? 503 : 200, { 'content-type': 'application/json' });
        const message = Array.isArray(body.tools)
          ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'freecode_ping', arguments: '{}' } }] }
          : { role: 'assistant', content: 'pong' };
        response.end(JSON.stringify({ choices: [{ message }] }));
        return;
      }
      if (!Array.isArray(body.tools) || body.tools.length === 0) {
        sse(response, { role: 'assistant', content: 'Recovery test' }, 'stop');
        return;
      }
      generations.push(body);
      if (generations.length === 1) held = response;
      else sse(response, { role: 'assistant', content: 'RECOVERY_OK' }, 'stop');
    });
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('local upstream did not bind');
  const lbBaseUrl = `http://127.0.0.1:${address.port}`;
  const homeDir = join(root, 'home');
  seedProviders({ homeDir, lbBaseUrl, modelIds });
  const refresh = () => refreshModels({ homeDir, userDataDir: join(root, 'catalog'), lbBaseUrl, exactModelIds: modelIds });
  const proc = launchHidden({ executable,
    args: [cli, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'],
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|SECRET|PASSWORD/i.test(key))),
      ELECTRON_RUN_AS_NODE: '1', DSH_HOME: homeDir, FREECODE_WEB_MODE: '1', FREECODE_PHOENIX_API_KEY: 'test-local-only' },
  }).proc;
  const closed = once(proc, 'close');
  let output = ''; proc.stdout?.on('data', b => { output += String(b); }); proc.stderr?.on('data', b => { output += String(b); });
  try {
    await vi.waitFor(() => {
      expect(proc.exitCode, output.slice(-2500)).toBeNull();
      expect(output).toMatch(/dsh web: http:\/\/127\.0\.0\.1:\d+\/\?\S+/);
    }, { timeout: 60_000, interval: 100 });
    const printed = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?\S+)/)![1]!;
    const login = await fetch(printed, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    expect(login.status).toBe(303);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const base = new URL(printed).origin;
    let rpcId = 0;
    const rpc = async (method: string, request?: Record<string, unknown>): Promise<any> => {
      const response = await fetch(`${base}/api/${method}`, { method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ type: 'client-request', rpcId: `recovery-${++rpcId}`, method,
          payload: { args: request === undefined ? {} : { request } } }),
      });
      const result = await response.json();
      expect(result.result.ok, JSON.stringify(result)).toBe(true);
      return result.result.value;
    };
    const catalog = async () => (await rpc('session/modelCatalog')).groups.find((g: any) => g.id === 'freecode-phoenix')?.models ?? [];
    expect(await catalog()).toEqual([]);
    await refresh();
    await vi.waitFor(async () => expect((await catalog()).map((m: any) => m.id)).toEqual(modelIds), { timeout: 20_000 });
    const { sessionId } = await rpc('session/create', { cwd: root });
    await rpc('session/selectModel', { sessionId, provider: 'freecode-phoenix', model: pinned });
    await rpc('session/prompt', { sessionId, requestId: 'recovery-prompt-1', mode: 'queue',
      content: [{ type: 'text', text: 'Record the completed recovery test step, then confirm.' }] });
    await vi.waitFor(() => expect(generations).toHaveLength(1), { timeout: 20_000 });
    expect(generations[0]!.tools.some(t => t.function.name === 'todo_write')).toBe(true);
    failing = true; await refresh();
    await vi.waitFor(async () => expect(await catalog()).toEqual([]), { timeout: 20_000 });
    sse(held!, { role: 'assistant', tool_calls: [{ index: 0, id: 'recovery_call', type: 'function',
      function: { name: 'todo_write', arguments: JSON.stringify({ todos: [{ content: 'Recovery test step', status: 'completed' }] }) } }] }, 'tool_calls');
    await vi.waitFor(() => expect(generations, output.slice(-2500)).toHaveLength(2), { timeout: 20_000 });
    expect(generations.map(g => g.model)).toEqual([pinned, pinned]);
    expect(generations[1]!.messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'tool', tool_call_id: 'recovery_call' })]));
    await vi.waitFor(async () => {
      const snapshot = await rpc('session/projections', { sessionId });
      const page = await rpc('session/page', { address: { kind: 'session', sessionId }, throughSeq: snapshot.asOfSeq });
      expect(JSON.stringify(page)).toContain('RECOVERY_OK');
      expect(JSON.stringify(page)).not.toContain('UNKNOWN_MODEL');
    }, { timeout: 20_000, interval: 200 });
    failing = false; await refresh();
    await vi.waitFor(async () => expect(await catalog()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pinned, contextWindow: 1_000_000 }),
    ])), { timeout: 20_000 });
  } catch (error) {
    console.error('Host recovery proof failed:', error);
    throw error;
  } finally {
    writeFileSync(join(tmpdir(), 'freecode-101-recovery-host-test.log'), output);
    if (proc.exitCode === null) proc.kill();
    await closed;
    upstream.closeAllConnections(); await new Promise<void>(done => upstream.close(() => done()));
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}, 120_000);
