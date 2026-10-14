import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OmniRouteManager } from '../src/main/omniroute.js';
import type { LaunchOptions } from '../src/main/freecode-launcher.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'freecode-omni-owned-'));
  roots.push(root);
  mkdirSync(join(root, 'runtime'), { recursive: true });
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), exitCode: null, killed: false,
    kill: vi.fn(() => { proc.killed = true; proc.emit('close', 0); return true; }),
  });
  const launch = vi.fn((_options: LaunchOptions) => ({ proc, metrics: {} }));
  return { root, proc, launch, options: {
    nodePath: process.execPath, runtimeDir: join(root, 'runtime'), userDataDir: join(root, 'data'),
    launch: launch as any, fetchImpl: vi.fn(async () => new Response('{}', { status: 200 })),
    choosePort: async () => 54321, readyTimeoutMs: 100,
  } };
}

describe('managed OmniRoute lifecycle', () => {
  it('starts lazily, only once, hidden and loopback-only without inherited credentials', async () => {
    const { options, launch, proc, root } = fixture();
    const manager = new OmniRouteManager(options);
    expect(launch).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([manager.start(), manager.start()]);
    expect(a).toBe('http://127.0.0.1:54321');
    expect(b).toBe(a);
    expect(launch).toHaveBeenCalledTimes(1);
    const launched = launch.mock.calls[0]![0];
    expect(launched.env).toMatchObject({
      HOSTNAME: '127.0.0.1', PORT: '54321', OMNIROUTE_AUTO_FREE_FALLBACK_TO_FULL_POOL: 'false',
      DATA_DIR: join(root, 'data', 'omniroute-data'), ELECTRON_RUN_AS_NODE: '1',
    });
    expect(launched.args?.[0]).toContain('node_modules');
    expect(launched.env).not.toHaveProperty('OPENAI_API_KEY');
    expect(launched.env).not.toHaveProperty('NODE_OPTIONS');
    expect(launched.env?.HOME).toBe(join(root, 'data', 'omniroute-data', 'home'));
    await manager.stop();
    await manager.stop();
    expect(proc.kill).toHaveBeenCalledTimes(1);
    await expect(manager.start()).rejects.toThrow(/stopped/);
  });

  it('fails closed on startup failure and stops only its exact child handle', async () => {
    const { options, proc } = fixture();
    options.fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    const manager = new OmniRouteManager({ ...options, readyTimeoutMs: 20 });
    await expect(manager.start()).rejects.toThrow(/ready/);
    expect(proc.kill).toHaveBeenCalledTimes(1);
    expect(manager.url).toBeUndefined();
    await manager.stop();
  });
});
