/**
 * LB retry contract — bounded fan-out across workers when the first
 * attempt fails BEFORE downstream headers are sent.
 *
 * Mirrors opencode2api/test_lb.py:
 *   a) status retryable before headers -> next worker
 *   b) streaming: first chunk passes before EOF (already-existing contract,
 *      must stay green)
 *   c) skip-set never re-elects a worker already tried
 *
 * Each test spins up cheap Node http servers as fake workers, wires them
 * into a stub Pool, and drives real HTTP through the createLoadBalancer
 * server. No electron, no opencode2api binary needed.
 */

import { describe, expect, it } from 'vitest';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { createLoadBalancer } from '../src/lb.js';
import type { Pool, WorkerHandle, Socks5Config } from '../src/types.js';

/** Minimal Pool for LB tests. Tracks parkWorker calls; pickHealthy honors
 *  the skip set exactly like OpenCodePool. */
function makeStubPool(workers: WorkerHandle[]): Pool & { parked: { id: string; ms: number }[]; picks: string[] } {
  const parked: { id: string; ms: number }[] = [];
  const picks: string[] = [];
  let rr = 0;
  return {
    async start() { /* noop */ },
    async stop() { /* noop */ },
    size() { return workers.length; },
    async resize() { /* noop */ },
    workers() { return workers.slice(); },
    pickHealthy(skip?: ReadonlySet<string>) {
      const eligible = workers.filter((w) => w.status === 'ready' && !(skip?.has(w.id) ?? false));
      if (eligible.length === 0) return null;
      const chosen = eligible[rr % eligible.length]!;
      rr++;
      picks.push(chosen.id);
      return chosen;
    },
    parkWorker(id, ms) { parked.push({ id, ms }); },
    onWorkerChange() { return () => { /* noop */ }; },
    async restartWorker() { /* noop */ },
    async setSocks5(_c: Socks5Config | null) { /* noop */ },
    parked,
    picks,
  };
}

async function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { reject(new Error('no port')); return; }
      resolve(addr.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((r) => server.close(() => r()));
}

interface Fetched { status: number; headers: Record<string, string | string[] | undefined>; body: string }

function fetchLb(port: number, path: string, method = 'POST', body = '{}', extraHeaders: Record<string, string> = {}): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...extraHeaders } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** Build a fake worker that responds according to `program[i]`, one entry
 *  per received request. Programs may return `{status, body}` or a delayed
 *  stream. */
type ProgramStep = { kind: 'status'; status: number; body?: string; contentType?: string } | { kind: 'stream'; chunks: string[]; delayMs?: number };

function makeFakeWorker(program: ProgramStep[]): { server: Server; hits: number; portPromise: Promise<number> } {
  const state = { hits: 0 };
  const server = createServer((req, res) => {
    // Consume request body so 'end' fires and program advances predictably.
    req.on('data', () => { /* discard */ });
    req.on('end', () => {
      const step = program[state.hits] ?? program[program.length - 1]!;
      state.hits++;
      if (step.kind === 'status') {
        res.writeHead(step.status, { 'content-type': step.contentType ?? 'application/json' });
        res.end(step.body ?? '');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      let i = 0;
      const delay = step.delayMs ?? 5;
      const tick = (): void => {
        if (i >= step.chunks.length) { res.end(); return; }
        res.write(step.chunks[i]!);
        i++;
        setTimeout(tick, delay);
      };
      tick();
    });
  });
  return {
    server,
    get hits() { return state.hits; },
    portPromise: listen(server),
  };
}

describe('LB retry fan-out', () => {
  it('(a) retryable status before headers rotates to next worker and succeeds', async () => {
    const w0 = makeFakeWorker([{ kind: 'status', status: 429, body: 'rate' }]);
    const w1 = makeFakeWorker([{ kind: 'status', status: 200, body: '{"ok":true}' }]);
    const p0 = await w0.portPromise;
    const p1 = await w1.portPromise;
    const workers: WorkerHandle[] = [
      { id: 'w0', pid: 1, port: p0, status: 'ready', startedAt: 0, restarts: 0 },
      { id: 'w1', pid: 2, port: p1, status: 'ready', startedAt: 0, restarts: 0 },
    ];
    const pool = makeStubPool(workers);
    const lb = createLoadBalancer({ pool, logError: () => undefined });
    await lb.listen();
    try {
      const result = await fetchLb(lb.port(), '/v1/chat/completions');
      expect(result.status).toBe(200);
      expect(result.body).toContain('"ok":true');
      // Both workers tried in order, first parked with 0 (429 does not park).
      expect(pool.picks).toEqual(['w0', 'w1']);
      expect(pool.parked).toEqual([{ id: 'w0', ms: 0 }]);
      expect(w0.hits).toBe(1);
      expect(w1.hits).toBe(1);
    } finally {
      await lb.close();
      await closeServer(w0.server);
      await closeServer(w1.server);
    }
  });

  it('parks a worker for ~8s when it returns 5xx before headers', async () => {
    const w0 = makeFakeWorker([{ kind: 'status', status: 503, body: 'down' }]);
    const w1 = makeFakeWorker([{ kind: 'status', status: 200, body: 'ok' }]);
    const p0 = await w0.portPromise;
    const p1 = await w1.portPromise;
    const workers: WorkerHandle[] = [
      { id: 'w0', pid: 1, port: p0, status: 'ready', startedAt: 0, restarts: 0 },
      { id: 'w1', pid: 2, port: p1, status: 'ready', startedAt: 0, restarts: 0 },
    ];
    const pool = makeStubPool(workers);
    const lb = createLoadBalancer({ pool, logError: () => undefined });
    await lb.listen();
    try {
      const result = await fetchLb(lb.port(), '/v1/chat/completions');
      expect(result.status).toBe(200);
      expect(pool.parked).toEqual([{ id: 'w0', ms: 8000 }]);
    } finally {
      await lb.close();
      await closeServer(w0.server);
      await closeServer(w1.server);
    }
  });

  it('(c) skip-set never re-picks a worker already tried', async () => {
    const w0 = makeFakeWorker([
      { kind: 'status', status: 500, body: '' },
      { kind: 'status', status: 500, body: '' },
      { kind: 'status', status: 500, body: '' },
    ]);
    const w1 = makeFakeWorker([{ kind: 'status', status: 500, body: '' }]);
    const p0 = await w0.portPromise;
    const p1 = await w1.portPromise;
    const workers: WorkerHandle[] = [
      { id: 'w0', pid: 1, port: p0, status: 'ready', startedAt: 0, restarts: 0 },
      { id: 'w1', pid: 2, port: p1, status: 'ready', startedAt: 0, restarts: 0 },
    ];
    const pool = makeStubPool(workers);
    const lb = createLoadBalancer({ pool, logError: () => undefined });
    await lb.listen();
    try {
      const result = await fetchLb(lb.port(), '/v1/chat/completions');
      // Two workers exist; MAX_ATTEMPTS=3 but only 2 unique workers → last
      // pick returns null and we forward the last upstream status.
      expect(result.status).toBe(500);
      // Both workers hit exactly once — the skip set prevents re-election.
      expect(w0.hits).toBe(1);
      expect(w1.hits).toBe(1);
      expect(pool.picks).toEqual(['w0', 'w1']);
    } finally {
      await lb.close();
      await closeServer(w0.server);
      await closeServer(w1.server);
    }
  });

  it('(b) streaming: first chunk reaches the client before EOF (post-commit no retry)', async () => {
    const w0 = makeFakeWorker([{ kind: 'stream', chunks: ['data: hello\n\n', 'data: world\n\n'], delayMs: 20 }]);
    const p0 = await w0.portPromise;
    const workers: WorkerHandle[] = [
      { id: 'w0', pid: 1, port: p0, status: 'ready', startedAt: 0, restarts: 0 },
    ];
    const pool = makeStubPool(workers);
    const lb = createLoadBalancer({ pool, logError: () => undefined });
    await lb.listen();
    try {
      // Manual read to observe partial delivery.
      const chunks: string[] = [];
      let firstChunkAt = 0;
      let endAt = 0;
      const startedAt = Date.now();
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port: lb.port(), path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': 2 } }, (res) => {
          res.on('data', (c: Buffer) => {
            if (chunks.length === 0) firstChunkAt = Date.now();
            chunks.push(c.toString());
          });
          res.on('end', () => { endAt = Date.now(); resolve(); });
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end('{}');
      });
      // First chunk arrived measurably before end (streaming preserved).
      expect(firstChunkAt).toBeGreaterThan(0);
      expect(firstChunkAt).toBeLessThan(endAt);
      expect(firstChunkAt - startedAt).toBeLessThan(endAt - startedAt);
      expect(chunks.join('')).toContain('hello');
      expect(chunks.join('')).toContain('world');
    } finally {
      await lb.close();
      await closeServer(w0.server);
    }
  });

  it('non-retryable status (400) never retries', async () => {
    const w0 = makeFakeWorker([{ kind: 'status', status: 400, body: '{"error":"bad request"}' }]);
    const w1 = makeFakeWorker([{ kind: 'status', status: 200, body: '' }]);
    const p0 = await w0.portPromise;
    const p1 = await w1.portPromise;
    const pool = makeStubPool([
      { id: 'w0', pid: 1, port: p0, status: 'ready', startedAt: 0, restarts: 0 },
      { id: 'w1', pid: 2, port: p1, status: 'ready', startedAt: 0, restarts: 0 },
    ]);
    const lb = createLoadBalancer({ pool, logError: () => undefined });
    await lb.listen();
    try {
      const result = await fetchLb(lb.port(), '/v1/chat/completions');
      expect(result.status).toBe(400);
      expect(pool.picks).toEqual(['w0']);
      expect(w1.hits).toBe(0);
    } finally {
      await lb.close();
      await closeServer(w0.server);
      await closeServer(w1.server);
    }
  });

  it('exhausted retries return the last upstream status (typically 429)', async () => {
    const w0 = makeFakeWorker([{ kind: 'status', status: 429, body: 'rate' }]);
    const w1 = makeFakeWorker([{ kind: 'status', status: 429, body: 'rate' }]);
    const w2 = makeFakeWorker([{ kind: 'status', status: 429, body: 'rate' }]);
    const p0 = await w0.portPromise;
    const p1 = await w1.portPromise;
    const p2 = await w2.portPromise;
    const pool = makeStubPool([
      { id: 'w0', pid: 1, port: p0, status: 'ready', startedAt: 0, restarts: 0 },
      { id: 'w1', pid: 2, port: p1, status: 'ready', startedAt: 0, restarts: 0 },
      { id: 'w2', pid: 3, port: p2, status: 'ready', startedAt: 0, restarts: 0 },
    ]);
    const lb = createLoadBalancer({ pool, logError: () => undefined });
    await lb.listen();
    try {
      const result = await fetchLb(lb.port(), '/v1/chat/completions');
      expect(result.status).toBe(429);
      // Each worker hit exactly once — the exact rotation order depends on
      // the shared rrIndex evolving as the skip set shrinks the eligible
      // pool, but the invariant is "no repeats, all three tried".
      expect(new Set(pool.picks)).toEqual(new Set(['w0', 'w1', 'w2']));
      expect(pool.picks).toHaveLength(3);
      expect(w0.hits).toBe(1);
      expect(w1.hits).toBe(1);
      expect(w2.hits).toBe(1);
    } finally {
      await lb.close();
      await closeServer(w0.server);
      await closeServer(w1.server);
      await closeServer(w2.server);
    }
  });

  it('sticky worker with retryable error fans out but does not evict the sticky map', async () => {
    const w0 = makeFakeWorker([{ kind: 'status', status: 502, body: '' }]);
    const w1 = makeFakeWorker([{ kind: 'status', status: 200, body: 'ok' }]);
    const p0 = await w0.portPromise;
    const p1 = await w1.portPromise;
    const pool = makeStubPool([
      { id: 'w0', pid: 1, port: p0, status: 'ready', startedAt: 0, restarts: 0 },
      { id: 'w1', pid: 2, port: p1, status: 'ready', startedAt: 0, restarts: 0 },
    ]);
    const lb = createLoadBalancer({ pool, logError: () => undefined });
    await lb.listen();
    try {
      // First request with sticky id sets the map to whichever worker served.
      const result = await fetchLb(lb.port(), '/v1/chat/completions', 'POST', '{}', { 'x-dsh-session-id': 'sess-1' });
      expect(result.status).toBe(200);
      expect(pool.picks[0]).toBe('w0'); // first pick tried w0 (round-robin, no prior sticky)
      expect(pool.picks[1]).toBe('w1'); // retry landed on w1
      // Sticky is committed to w1 (the successful attempt), not w0.
      // Second request with same sticky routes straight to w1 (skip pool.pickHealthy).
      const before = pool.picks.length;
      const result2 = await fetchLb(lb.port(), '/v1/chat/completions', 'POST', '{}', { 'x-dsh-session-id': 'sess-1' });
      expect(result2.status).toBe(200);
      // No pool.pickHealthy call on the second request (sticky resolved).
      expect(pool.picks.length).toBe(before);
    } finally {
      await lb.close();
      await closeServer(w0.server);
      await closeServer(w1.server);
    }
  });
});
