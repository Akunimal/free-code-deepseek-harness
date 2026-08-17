import { describe, it, expect } from 'vitest';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLoadBalancer, OpenCodePool } from '@freecode/opencode-adapter';

/**
 * Contract: the LB surface (5, 6, 7 from the plan).
 *   GET /v1/models → {data:[{id}]} JSON contract
 *   POST /v1/chat/completions stream → SSE data: frames
 *   503 JSON without healthy workers
 *   opencode2api flags --port/--password/--config
 */

const FAKE_BIN = join(import.meta.dirname, '../fixtures/fake-worker.mjs');
const NODE = process.env.FREECODE_NODE ?? 'node';

// ---------------------------------------------------------------------------
// 7. opencode2api CLI flags → detect renames
// ---------------------------------------------------------------------------
describe('contract: opencode2api CLI flags', () => {
  const roots = [
    join(import.meta.dirname, '../../../apps/shell/resources/opencode2api'),
    join(import.meta.dirname, '../../../../vendor/opencode2api/bin'),
  ];
  const bin = roots
    .map((r) => join(r, 'opencode2api-win-x64.exe'))
    .find((b) => existsSync(b));
  it.skipIf(!bin)('binary exposes -port/-password/-config (Go flag style)', () => {
    const r = spawnSync(bin!, ['--help'], { encoding: 'utf8', timeout: 15_000 });
    expect(r.status).toBe(0);
    const help = r.stdout + r.stderr;
    // NB: opencode2api uses Go stdlib flags (single dash) — this is the
    // contract our pool spawns against.
    expect(help).toContain('-port');
    expect(help).toContain('-password');
    expect(help).toContain('-config');
  });
});

// ---------------------------------------------------------------------------
// Fake worker harness: spawn a node process, wait for READY line
// ---------------------------------------------------------------------------
async function startFakeWorker(): Promise<{ proc: ChildProcess; port: number }> {
  const proc = spawn(NODE, [FAKE_BIN], { stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fake worker not ready')), 10_000);
    const onData = (chunk: Buffer): void => {
      const line = chunk.toString();
      const m = line.match(/READY 127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        cleanup();
        resolve(Number(m[1]));
      }
    };
    const onExit = (code: number | null): void => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`fake worker exited early: ${code}`));
    };
    const cleanup = (): void => {
      proc.stdout?.off('data', onData);
      proc.stderr?.off('data', onData);
      proc.off('exit', onExit);
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('exit', onExit);
  });
  return { proc, port };
}

async function withWorker<T>(fn: (port: number) => Promise<T>): Promise<T> {
  const { proc, port } = await startFakeWorker();
  try {
    return await fn(port);
  } finally {
    if (proc.exitCode === null) {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { windowsHide: true });
    }
  }
}

/** Pool whose workerMap has one entry pointing at the fake worker's port. */
function poolWithFake(port: number, logDir: string, id: string): OpenCodePool {
  const pool = new OpenCodePool({ binaryPath: FAKE_BIN, count: 0, logDir }) as OpenCodePool & {
    workerMap: Map<string, { id: string; pid: number; port: number; status: string; startedAt: number; restarts: number }>;
  };
  pool.workerMap.set(id, {
    id,
    pid: -1,
    port,
    status: 'ready',
    startedAt: Date.now(),
    restarts: 0,
  });
  return pool;
}

// ---------------------------------------------------------------------------
// 5. /v1/models JSON contract
// ---------------------------------------------------------------------------
describe('contract: LB /v1/models', () => {
  it('returns 200 application/json {data:[{id}]}', async () => {
    const logDir = mkdtempSync(join(tmpdir(), 'lb-models-'));
    await withWorker(async (port) => {
      const pool = poolWithFake(port, logDir, 'w-models');
      const lb = createLoadBalancer({ pool, authHeader: undefined });
      await lb.listen();
      try {
        const res = await fetch(`${lb.url()}/v1/models`);
        expect(res.status).toBe(200);
        const ct = res.headers.get('content-type') ?? '';
        expect(ct).toContain('application/json');
        const body = (await res.json()) as { data: { id: string }[] };
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
        expect(typeof body.data[0]!.id).toBe('string');
      } finally {
        await lb.close();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 6. SSE streaming contract
// ---------------------------------------------------------------------------
describe('contract: LB SSE streaming', () => {
  it('POST /v1/chat/completions streams data: frames', async () => {
    const logDir = mkdtempSync(join(tmpdir(), 'lb-sse-'));
    await withWorker(async (port) => {
      const pool = poolWithFake(port, logDir, 'w-sse');
      const lb = createLoadBalancer({ pool, authHeader: undefined });
      await lb.listen();
      try {
        const res = await fetch(`${lb.url()}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'fake-model',
            messages: [{ role: 'user', content: 'hi' }],
            stream: true,
          }),
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        const frames = text
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .filter((l) => l.length > 0 && l !== '[DONE]');
        expect(frames.length).toBeGreaterThan(0);
        const first = JSON.parse(frames[0]!) as { choices: { delta: { role?: string; content?: string } }[] };
        expect(first.choices[0]!.delta).toMatchObject({});
      } finally {
        await lb.close();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// LB 503 without workers
// ---------------------------------------------------------------------------
describe('contract: LB 503', () => {
  it('returns 503 JSON when no healthy worker', async () => {
    const logDir = mkdtempSync(join(tmpdir(), 'lb-503-'));
    const pool = new OpenCodePool({ binaryPath: FAKE_BIN, count: 0, logDir });
    const lb = createLoadBalancer({ pool, authHeader: undefined });
    await lb.listen();
    try {
      const res = await fetch(`${lb.url()}/v1/models`);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error?: string };
      expect(typeof body.error).toBe('string');
    } finally {
      await lb.close();
    }
  });
});