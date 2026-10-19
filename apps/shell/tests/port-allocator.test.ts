import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { pickFreePort } from '../src/main/port-allocator.js';

const open: Server[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

function occupy(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    open.push(server);
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolve());
  });
}

describe('pickFreePort', () => {
  it('returns the preferred port when it is free', async () => {
    const free = await pickFreePort(45_000, { attempts: 1 });
    expect(free).toBe(45_000);
  });

  it('skips a busy port and returns the next free one, never touching the listener', async () => {
    const base = 46_000;
    await occupy(base);
    const picked = await pickFreePort(base);
    expect(picked).toBe(base + 1);
    // The existing listener is still there and still ours.
    await expect(occupy(base)).rejects.toThrow();
  });

  it('skips several busy ports in a row', async () => {
    const base = 47_000;
    await occupy(base);
    await occupy(base + 1);
    await occupy(base + 2);
    expect(await pickFreePort(base)).toBe(base + 3);
  });

  it('fails when every candidate in range is busy', async () => {
    const base = 48_000;
    await occupy(base);
    await occupy(base + 1);
    await expect(pickFreePort(base, { attempts: 2 })).rejects.toThrow(/no free loopback port/);
  });
});
