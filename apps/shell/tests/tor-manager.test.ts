import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { findFreePort, TorManager, waitForTorBootstrap } from '../src/main/tor-manager.js';
import { launchHidden, killProcessTree } from '../src/main/freecode-launcher.js';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../src/main/freecode-launcher.js', () => ({
  launchHidden: vi.fn(),
  killProcessTree: vi.fn(),
}));

function fakeTorProcess(pid: number): ChildProcess {
  let proc: ChildProcess;
  proc = Object.assign(new EventEmitter(), {
    pid,
    exitCode: null,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(() => {
      Object.defineProperty(proc, 'exitCode', { value: 0, writable: true, configurable: true });
      proc.emit('exit', 0, null);
      return true;
    }),
  }) as unknown as ChildProcess;
  return proc;
}

describe('TorManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tor-mgr-test-'));
    vi.mocked(launchHidden).mockReset();
    vi.mocked(killProcessTree).mockReset();
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it('findFreePort scans upward and skips reserved ports', async () => {
    const used = new Set<number>();
    const port1 = await findFreePort(9800, used);
    expect(port1).toBeGreaterThanOrEqual(9800);
    expect(used.has(port1)).toBe(true);

    const port2 = await findFreePort(9800, used);
    expect(port2).toBeGreaterThan(port1);
    expect(used.has(port2)).toBe(true);
  });

  it('returns failed status when tor binary is missing', async () => {
    const manager = new TorManager({
      torBinaryPath: join(tmpDir, 'missing-tor.exe'),
      dataDir: tmpDir,
      geoipDir: tmpDir,
    });

    const status = await manager.start();
    expect(status.active).toBe(false);
    expect(status.status).toBe('failed');
    expect(status.lastError).toContain('tor.exe binary missing');
  });

  it('refuses identity rotation while stopped', async () => {
    const manager = new TorManager({
      torBinaryPath: join(tmpDir, 'tor.exe'),
      dataDir: tmpDir,
      geoipDir: tmpDir,
    });

    await expect(manager.rotateIdentity()).resolves.toBe(false);
  });

  it('reports initial stopped status before start', () => {
    const manager = new TorManager({
      torBinaryPath: join(tmpDir, 'tor.exe'),
      dataDir: tmpDir,
      geoipDir: tmpDir,
    });

    const status = manager.getStatus();
    expect(status.active).toBe(false);
    expect(status.status).toBe('stopped');
    expect(status.pid).toBe(-1);
    expect(manager.isReady).toBe(false);
  });

  it('does not treat an open SOCKS listener as ready before Tor reports 100% bootstrap', async () => {
    const progress = [35, 99, 100];
    let reads = 0;

    await expect(waitForTorBootstrap({
      isProcessAlive: () => true,
      isSocksReady: async () => true,
      readBootstrapProgress: async () => progress[reads++] ?? null,
      timeoutMs: 250,
      pollMs: 0,
    })).resolves.toBe(true);
    expect(reads).toBe(3);
  });

  it('times out instead of accepting an open SOCKS listener with incomplete bootstrap', async () => {
    await expect(waitForTorBootstrap({
      isProcessAlive: () => true,
      isSocksReady: async () => true,
      readBootstrapProgress: async () => 99,
      timeoutMs: 15,
      pollMs: 1,
    })).resolves.toBe(false);
  });

  it('waits for the SOCKS listener as well as 100% bootstrap', async () => {
    let socksChecks = 0;
    let progressChecks = 0;

    await expect(waitForTorBootstrap({
      isProcessAlive: () => true,
      isSocksReady: async () => ++socksChecks > 1,
      readBootstrapProgress: async () => {
        progressChecks += 1;
        return 100;
      },
      timeoutMs: 250,
      pollMs: 0,
    })).resolves.toBe(true);
    expect(socksChecks).toBe(2);
    expect(progressChecks).toBe(1);
  });

  it('stops polling immediately when the Tor process exits', async () => {
    let progressChecks = 0;

    await expect(waitForTorBootstrap({
      isProcessAlive: () => false,
      isSocksReady: async () => true,
      readBootstrapProgress: async () => {
        progressChecks += 1;
        return 100;
      },
      timeoutMs: 250,
      pollMs: 0,
    })).resolves.toBe(false);
    expect(progressChecks).toBe(0);
  });

  it('does not turn an intentional stop during bootstrap into a startup failure', async () => {
    const torPath = join(tmpDir, 'tor.exe');
    writeFileSync(torPath, 'test stub');
    const proc = fakeTorProcess(4242);
    vi.mocked(launchHidden).mockReturnValue({ proc } as ReturnType<typeof launchHidden>);

    const manager = new TorManager({
      torBinaryPath: torPath,
      dataDir: tmpDir,
      geoipDir: tmpDir,
      socksPort: 19_800,
      controlPort: 19_801,
    });

    const starting = manager.start();
    await vi.waitFor(() => expect(launchHidden).toHaveBeenCalled(), { timeout: 2_000 });
    await manager.stop();

    await expect(starting).resolves.toMatchObject({ status: 'stopped', active: false });
  });

  it('waits for an in-flight stop to finish before starting a new Tor process', async () => {
    const torPath = join(tmpDir, 'tor.exe');
    writeFileSync(torPath, 'test stub');
    vi.mocked(launchHidden)
      .mockReturnValueOnce({ proc: fakeTorProcess(4243) } as ReturnType<typeof launchHidden>)
      .mockReturnValueOnce({ proc: fakeTorProcess(4244) } as ReturnType<typeof launchHidden>);
    const manager = new TorManager({
      torBinaryPath: torPath,
      dataDir: tmpDir,
      geoipDir: tmpDir,
      socksPort: 19_810,
      controlPort: 19_811,
    });

    const firstStart = manager.start();
    await vi.waitFor(() => expect(launchHidden).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    const stopping = manager.stop();
    const secondStart = manager.start();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(launchHidden).toHaveBeenCalledTimes(1);
    await stopping;
    await vi.waitFor(() => expect(launchHidden).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    await manager.stop();

    await expect(firstStart).resolves.toMatchObject({ status: 'stopped', active: false });
    await expect(secondStart).resolves.toMatchObject({ status: 'stopped', active: false });
  });
});
