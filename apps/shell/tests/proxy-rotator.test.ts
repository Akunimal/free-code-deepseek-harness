import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProxyRotator, type ProxyCandidate } from '../src/main/proxy-rotator.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function proxyfile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'freecode-rotator-'));
  roots.push(dir);
  return join(dir, 'opencode2api', 'proxies.txt');
}
const read = (path: string): string[] => readFileSync(path, 'utf8').split('\n').filter(Boolean);

describe('ProxyRotator', () => {
  it('writes only strict-verified proxies to the proxyfile, fastest first, and notifies', async () => {
    const path = proxyfile();
    const candidates: ProxyCandidate[] = [
      { ip: '1.1.1.1', port: 1080 }, // ok, slow
      { ip: '2.2.2.2', port: 1080 }, // fails verify
      { ip: '3.3.3.3', port: 1080 }, // ok, fast
    ];
    const changes: number[] = [];
    const rotator = new ProxyRotator({
      proxyfilePath: path,
      onPoolChanged: (pool) => { changes.push(pool.length); },
      fetchCandidates: async () => candidates,
      verifyCandidate: async (c) => c.ip === '2.2.2.2'
        ? { ok: false, latencyMs: 0 }
        : { ok: true, latencyMs: c.ip === '1.1.1.1' ? 900 : 100 },
    });
    await rotator.harvest();
    expect(read(path)).toEqual(['socks5h://3.3.3.3:1080', 'socks5h://1.1.1.1:1080']);
    expect(changes).toEqual([2]);
    expect(rotator.healthy.map((p) => p.address)).toEqual(['socks5h://3.3.3.3:1080', 'socks5h://1.1.1.1:1080']);
  });

  it('keeps the current pool when a harvest finds nothing healthy', async () => {
    const path = proxyfile();
    let healthy = true;
    let changes = 0;
    const rotator = new ProxyRotator({
      proxyfilePath: path,
      onPoolChanged: () => { changes++; },
      fetchCandidates: async () => [{ ip: '9.9.9.9', port: 1080 }],
      verifyCandidate: async () => ({ ok: healthy, latencyMs: 10 }),
    });
    await rotator.harvest();
    expect(rotator.healthy).toHaveLength(1);
    expect(changes).toBe(1);
    healthy = false;
    await rotator.harvest();
    // Pool and proxyfile untouched; no spurious reload.
    expect(rotator.healthy).toHaveLength(1);
    expect(changes).toBe(1);
  });

  it('keeps the current pool when the candidate fetch returns nothing', async () => {
    const path = proxyfile();
    let changes = 0;
    const rotator = new ProxyRotator({
      proxyfilePath: path,
      onPoolChanged: () => { changes++; },
      fetchCandidates: async () => [],
      verifyCandidate: async () => ({ ok: true, latencyMs: 1 }),
    });
    await rotator.harvest();
    expect(changes).toBe(0);
    expect(rotator.healthy).toHaveLength(0);
  });

  it('engage harvests once and is idempotent; stop halts the timer', async () => {
    const path = proxyfile();
    let fetches = 0;
    const rotator = new ProxyRotator({
      proxyfilePath: path,
      onPoolChanged: () => {},
      fetchCandidates: async () => { fetches++; return [{ ip: '1.1.1.1', port: 1 }]; },
      verifyCandidate: async () => ({ ok: true, latencyMs: 5 }),
    });
    expect(rotator.isEngaged).toBe(false);
    rotator.engage();
    rotator.engage(); // idempotent: no second timer/harvest storm
    await new Promise((r) => setTimeout(r, 20));
    expect(rotator.isEngaged).toBe(true);
    expect(fetches).toBe(1);
    rotator.stop();
  });

  it('reports every harvest stage so the selector never waits without an end state', async () => {
    const stages: string[] = [];
    const onStatus = (status: string, healthy: number): void => { stages.push(`${status}:${healthy}`); };
    const healthyRun = new ProxyRotator({
      proxyfilePath: proxyfile(),
      onPoolChanged: () => {},
      onStatus,
      fetchCandidates: async () => [{ ip: '1.1.1.1', port: 1 }],
      verifyCandidate: async () => ({ ok: true, latencyMs: 5 }),
    });
    await healthyRun.harvest();
    const emptyRun = new ProxyRotator({
      proxyfilePath: proxyfile(),
      onPoolChanged: () => {},
      onStatus,
      fetchCandidates: async () => [],
      verifyCandidate: async () => ({ ok: true, latencyMs: 1 }),
    });
    await emptyRun.harvest();
    const failedRun = new ProxyRotator({
      proxyfilePath: proxyfile(),
      onPoolChanged: () => {},
      onStatus,
      fetchCandidates: async () => { throw new Error('offline'); },
    });
    await failedRun.harvest();
    expect(stages).toEqual([
      'harvesting:0', 'ready:1',
      'harvesting:0', 'empty:0',
      'harvesting:0', 'empty:0',
    ]);
  });
});

describe('shouldNotifyProxyStage', () => {
  it('notifies only transitions the user can act on', async () => {
    const { shouldNotifyProxyStage } = await import('../src/main/proxy-rotator.js');
    expect(shouldNotifyProxyStage('harvesting', 0, 0)).toBe(true);
    expect(shouldNotifyProxyStage('harvesting', 12, 12)).toBe(false);
    expect(shouldNotifyProxyStage('ready', 12, 0)).toBe(true);
    expect(shouldNotifyProxyStage('ready', 15, 12)).toBe(false);
    expect(shouldNotifyProxyStage('empty', 0, 0)).toBe(true);
    expect(shouldNotifyProxyStage('empty', 12, 12)).toBe(false);
  });
});
