import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findFreePort, TorManager } from '../src/main/tor-manager.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('TorManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tor-mgr-test-'));
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
});
