import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ensureCanonicalSession,
  generateGatewayConfigs,
  cleanupZombieProcesses,
  saveProcessPids,
  type OcGatewayRuntimeConfigs,
} from '../src/main/oc-gateway.js';

describe('oc-gateway supervisor utilities', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `oc-gw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('generates configs with strict 127.0.0.1 binding and WARP pool enabled', () => {
    const ocHome = join(tempDir, 'oc-gateway');
    const configs = generateGatewayConfigs({
      ocHome,
      proxyPort: 18080,
      poolPort: 18082,
      directPort: 18084,
      apiKey: 'test-key',
    });

    expect(configs.poolConfigPath).toBeDefined();
    expect(existsSync(configs.poolConfigPath)).toBe(true);
    const poolConfig = JSON.parse(readFileSync(configs.poolConfigPath, 'utf8'));
    expect(poolConfig.listen).toBe('127.0.0.1:18082');
    expect(poolConfig.listen).not.toContain('0.0.0.0');
    expect(poolConfig.warp.enabled).toBe(true);
    expect(poolConfig.warp.pool_size).toBe(4);

    expect(configs.directConfigPath).toBeDefined();
    expect(existsSync(configs.directConfigPath)).toBe(true);
    const directConfig = JSON.parse(readFileSync(configs.directConfigPath, 'utf8'));
    expect(directConfig.listen).toBe('127.0.0.1:18084');
    expect(directConfig.listen).not.toContain('0.0.0.0');
  });

  it('persists and reuses canonical session across runs', () => {
    const ocHome = join(tempDir, 'oc-gateway');
    const sessionFile = join(ocHome, 'session.json');

    // First call generates new session
    const session1 = ensureCanonicalSession(ocHome);
    expect(session1).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(existsSync(sessionFile)).toBe(true);

    // Second call reuses persisted session
    const session2 = ensureCanonicalSession(ocHome);
    expect(session2).toBe(session1);
  });

  it('saves and cleans up process PIDs for anti-zombie protection', () => {
    const ocHome = join(tempDir, 'oc-gateway');
    const pidFile = join(ocHome, 'pids.json');

    saveProcessPids(ocHome, [99999991, 99999992]);
    expect(existsSync(pidFile)).toBe(true);
    const saved = JSON.parse(readFileSync(pidFile, 'utf8'));
    expect(saved.pids).toEqual([99999991, 99999992]);

    // Cleanup should read pids and remove file without throwing even if PIDs are not alive
    expect(() => cleanupZombieProcesses(ocHome)).not.toThrow();
    expect(existsSync(pidFile)).toBe(false);
  });
});
