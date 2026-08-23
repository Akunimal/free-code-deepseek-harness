import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  OpenCodePool,
  getFreePort,
  createLoadBalancer,
  normalizePoolSize,
  DEFAULT_POOL_SIZE,
} from '../src/index.js';
import type { WorkerHandle } from '../src/index.js';

const BIN = join(
  import.meta.dirname,
  '../../../apps/shell/resources/opencode2api',
  process.platform === 'win32'
    ? 'opencode2api-win-x64.exe'
    : process.platform === 'darwin'
      ? 'opencode2api-mac-arm64'
      : 'opencode2api-linux-x64',
);

const tmp = mkdtempSync(join(tmpdir(), 'o2a-pool-test-'));
const logDir = join(tmp, 'logs');
const workDir = join(tmp, 'workers');

function waitFor(fn: () => boolean, timeoutMs = 20_000, intervalMs = 250): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        if (fn()) return resolve();
        if (Date.now() > deadline) return reject(new Error('waitFor timeout'));
        setTimeout(tick, intervalMs);
      } catch (e) {
        reject(e);
      }
    };
    tick();
  });
}

describe('OpenCodePool', () => {
  it('uses six workers when no pool size is supplied', () => {
    const pool = new OpenCodePool({ binaryPath: BIN, workDir, logDir });
    expect(DEFAULT_POOL_SIZE).toBe(6);
    expect(pool.size()).toBe(6);
  });

  it('clamps the worker slider to the supported range', () => {
    expect(normalizePoolSize(0)).toBe(1);
    expect(normalizePoolSize(4.9)).toBe(4);
    expect(normalizePoolSize(99)).toBe(16);
    expect(normalizePoolSize(Number.NaN)).toBe(1);
  });

  it('applies a bounded resize before workers start', async () => {
    const pool = new OpenCodePool({ size: 4, binaryPath: BIN, workDir, logDir });
    await pool.resize(99);
    expect(pool.size()).toBe(16);
    await pool.resize(0);
    expect(pool.size()).toBe(1);
  });

  afterAll(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('spawns 4 workers and all reach ready', async () => {
    const pool = new OpenCodePool({ size: 4, binaryPath: BIN, workDir, logDir });
    await pool.start();
    try {
      await waitFor(() => pool.workers().every((w) => w.status === 'ready'), 30_000);
      const ws = pool.workers();
      expect(ws).toHaveLength(4);
      for (const w of ws) {
        expect(w.status).toBe('ready');
        expect(w.port).toBeGreaterThan(0);
        expect(typeof w.pid).toBe('number');
      }
      // unique ports
      expect(new Set(ws.map((w) => w.port)).size).toBe(4);
    } finally {
      await pool.stop();
    }
  }, 60_000);

  it('pickHealthy round-robins across ready workers', async () => {
    const pool = new OpenCodePool({ size: 4, binaryPath: BIN, workDir, logDir });
    await pool.start();
    try {
      await waitFor(() => pool.workers().filter((w) => w.status === 'ready').length === 4, 30_000);
      const seen = new Set<string>();
      for (let i = 0; i < 8; i++) {
        const w = pool.pickHealthy();
        expect(w).not.toBeNull();
        seen.add(w!.id);
      }
      expect(seen.size).toBe(4); // every worker got picked
    } finally {
      await pool.stop();
    }
  }, 60_000);

  it('respawns a killed worker', async () => {
    const pool = new OpenCodePool({ size: 4, binaryPath: BIN, workDir, logDir });
    await pool.start();
    try {
      await waitFor(() => pool.workers().filter((w) => w.status === 'ready').length === 4, 30_000);
      const victim = pool.workers().find((w) => w.status === 'ready')!;
      const victimPid = victim.pid;
      // Hard kill (taskkill on win, SIGKILL elsewhere) — bypasses our bookkeeping.
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/T', '/F', '/PID', String(victimPid)], { stdio: 'ignore' });
      } else {
        try {
          process.kill(victimPid, 'SIGKILL');
        } catch {
          /* best effort */
        }
      }
      // Pool should notice the exit and respawn a new worker with the same id.
      await waitFor(() => {
        const w = pool.workers().find((x) => x.id === victim.id);
        return w && w.status === 'ready' && w.pid !== victimPid;
      }, 30_000);
      const reborn = pool.workers().find((x) => x.id === victim.id)!;
      expect(reborn.status).toBe('ready');
      expect(reborn.pid).not.toBe(victimPid);
    } finally {
      await pool.stop();
    }
  }, 90_000);

  it('stop() leaves no opencode2api processes behind', async () => {
    const pool = new OpenCodePool({ size: 4, binaryPath: BIN, workDir, logDir });
    await pool.start();
    await waitFor(() => pool.workers().filter((w) => w.status === 'ready').length === 4, 30_000);
    const spawnedPids = pool.workers().map((w) => w.pid).filter((pid) => pid > 0);
    await pool.stop();
    await waitFor(() => pool.workers().length === 0, 10_000);
    // Verify only this test's processes are gone. FreeCode may have its own
    // live workers, so a global image-name check would be invalid.
    if (process.platform === 'win32') {
      for (const pid of spawnedPids) {
        const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
          encoding: 'utf8',
        });
        expect(out).not.toMatch(/opencode2api-win-x64\.exe/i);
      }
    } else {
      for (const pid of spawnedPids) {
        const out = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
        expect(out).not.toMatch(/opencode2api-(win-x64|mac-arm64|linux-x64)/);
      }
    }
  }, 90_000);
});

describe('getFreePort', () => {
  it('returns a positive port number', async () => {
    const p = await getFreePort();
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(65_536);
  });
});

describe('LoadBalancer', () => {
  it('routes /v1/models through the pool and exposes /pool/status', async () => {
    const pool = new OpenCodePool({ size: 2, binaryPath: BIN, workDir, logDir });
    await pool.start();
    const lb = createLoadBalancer({ pool, authHeader: 'Bearer public' });
    await lb.listen();
    try {
      await waitFor(() => pool.workers().filter((w) => w.status === 'ready').length >= 2, 30_000);

      // LB liveness reflects pool health
      const health = await fetch(`${lb.url()}/health`);
      expect(health.status).toBe(200);

      // pool/status JSON
      const status = await fetch(`${lb.url()}/pool/status`).then((r) => r.json() as Promise<{ workers: WorkerHandle[] }>);
      expect(status.workers.length).toBe(2);

      // Model listing is proxied
      const models = await fetch(`${lb.url()}/v1/models`, {
        headers: { Authorization: 'Bearer public' },
      });
      expect(models.status).toBe(200);
      const body = (await models.json()) as { data: { id: string }[] };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    } finally {
      await lb.close();
      await pool.stop();
    }
  }, 90_000);

  it('returns 503 when no healthy workers', async () => {
    const pool = new OpenCodePool({ size: 1, binaryPath: BIN, workDir, logDir });
    // Do NOT start the pool: LB should report no healthy workers.
    const lb = createLoadBalancer({ pool });
    await lb.listen();
    try {
      const res = await fetch(`${lb.url()}/health`);
      expect(res.status).toBe(503);
      const proxied = await fetch(`${lb.url()}/v1/models`);
      expect(proxied.status).toBe(503);
    } finally {
      await lb.close();
    }
  }, 30_000);
});
