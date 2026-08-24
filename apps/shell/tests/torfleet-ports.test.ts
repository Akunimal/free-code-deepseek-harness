/**
 * Tor Fleet port allocation — mirror of Hermes alloc_ports.py::_alloc.
 *
 * The fix: scan upward from the preferred base so a busy base port (DeepSeek
 * Harness, Hermes, a stale Tor) no longer silently drops a fleet instance.
 * Two instances in the same allocation pass must never claim the same port.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { createServer, type Server } from 'node:net';
import { findFreePort } from '../src/main/torfleet.js';

const open: Server[] = [];

function occupy(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => { open.push(srv); resolve(); });
  });
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('findFreePort', () => {
  it('returns the preferred port when it is free', async () => {
    const used = new Set<number>();
    // Pick a high base unlikely to be occupied on the test host.
    const base = 41000;
    const port = await findFreePort(base, used);
    expect(port).toBe(base);
    expect(used.has(base)).toBe(true);
  });

  it('scans upward past an occupied base port', async () => {
    const base = 41100;
    await occupy(base);
    const used = new Set<number>();
    const port = await findFreePort(base, used);
    expect(port).toBeGreaterThan(base);
  });

  it('never returns a port already reserved in the used set', async () => {
    const base = 41200;
    const used = new Set<number>();
    const first = await findFreePort(base, used);
    const second = await findFreePort(base, used); // same preferred base
    expect(second).not.toBe(first);
    expect(second).toBeGreaterThan(first);
  });

  it('skips multiple consecutive occupied ports', async () => {
    const base = 41300;
    await occupy(base);
    await occupy(base + 1);
    await occupy(base + 2);
    const used = new Set<number>();
    const port = await findFreePort(base, used);
    expect(port).toBeGreaterThanOrEqual(base + 3);
  });

  it('allocates distinct ports for a simulated 4-instance fleet', async () => {
    // Occupy the two canonical bases so the fleet has to scan — proves the
    // real scenario where DSH/Hermes hold 9150/9251.
    const socksBase = 41400;
    const controlBase = 41500;
    await occupy(socksBase);
    await occupy(controlBase);
    const used = new Set<number>();
    const ports: Array<{ socks: number; control: number }> = [];
    for (let i = 0; i < 4; i++) {
      const socks = await findFreePort(socksBase + i, used);
      const control = await findFreePort(controlBase + i, used);
      ports.push({ socks, control });
    }
    const all = ports.flatMap((p) => [p.socks, p.control]);
    // All 8 ports distinct, none equal to the occupied bases.
    expect(new Set(all).size).toBe(8);
    expect(all).not.toContain(socksBase);
    expect(all).not.toContain(controlBase);
  });
});
