import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { startKiloLane, type KiloLaneInstance } from '../src/main/kilo-lane.js';

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

// Fake Kilo gateway: records what the lane forwards and answers like the real one.
function fakeUpstream(): Promise<{ server: Server; base: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      if (req.url?.endsWith('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'kilo-auto/free' }] }));
        return;
      }
      if (req.url?.endsWith('/chat/completions') && JSON.parse(body).stream === true) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n');
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}/api/v1`, seen });
    });
  });
}

const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
});

async function lane(base: string): Promise<KiloLaneInstance> {
  const instance = await startKiloLane({ apiKey: 'public', upstreamBaseUrl: base });
  if (!instance) throw new Error('lane did not start');
  closers.push(() => instance.stop());
  return instance;
}

describe('kilo lane (local OpenAI-compatible shim over the Kilo gateway)', () => {
  it('answers health without auth', async () => {
    const up = await fakeUpstream();
    closers.push(() => { up.server.close(); });
    const l = await lane(up.base);
    const res = await fetch(`${l.url}/healthz`);
    expect(res.status).toBe(200);
  });

  it('rejects a wrong local key and never calls upstream', async () => {
    const up = await fakeUpstream();
    closers.push(() => { up.server.close(); });
    const l = await lane(up.base);
    const res = await fetch(`${l.url}/v1/models`, { headers: { Authorization: 'Bearer wrong' } });
    expect(res.status).toBe(401);
    expect(up.seen).toHaveLength(0);
  });

  it('forwards chat completions without any Authorization header upstream', async () => {
    const up = await fakeUpstream();
    closers.push(() => { up.server.close(); });
    const l = await lane(up.base);
    const res = await fetch(`${l.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer public', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'kilo-auto/free', messages: [{ role: 'user', content: 'OK' }] }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).choices[0].message.content).toBe('OK');
    const call = up.seen[0]!;
    expect(call.url).toBe('/api/v1/chat/completions');
    expect(call.headers.authorization).toBeUndefined();
    expect(JSON.parse(call.body).model).toBe('kilo-auto/free');
  });

  it('passes server-sent event streams through unbuffered in content', async () => {
    const up = await fakeUpstream();
    closers.push(() => { up.server.close(); });
    const l = await lane(up.base);
    const res = await fetch(`${l.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer public', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'kilo-auto/free', stream: true, messages: [] }),
    });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const text = await res.text();
    expect(text).toContain('"content":"hi"');
    expect(text).toContain('[DONE]');
  });

  it('serves the model list from upstream', async () => {
    const up = await fakeUpstream();
    closers.push(() => { up.server.close(); });
    const l = await lane(up.base);
    const res = await fetch(`${l.url}/v1/models`, { headers: { Authorization: 'Bearer public' } });
    expect((await res.json()).data[0].id).toBe('kilo-auto/free');
  });
});
