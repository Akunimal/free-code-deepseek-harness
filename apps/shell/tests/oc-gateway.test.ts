import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ensureCanonicalSession,
  ensureServerKey,
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

  it('generates configs with zen prefer, reasoning policy, and sota model rotation', () => {
    const ocHome = join(tempDir, 'oc-gateway');
    const SOTA_ORDER = [
      'deepseek-v4.1-flash-free',
      'glm-5.3-flash-free',
      'minimax-m3.1-flash-free',
      'mimo-v2.6-flash-free',
      'big-pickle',
    ];
    const configs = generateGatewayConfigs({
      ocHome,
      proxyPort: 18080,
      poolPort: 18082,
      directPort: 18084,
      apiKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    const poolConfig = JSON.parse(readFileSync(configs.poolConfigPath, 'utf8'));
    expect(poolConfig.prefer).toBe('zen');
    expect(poolConfig.reasoning?.effort).toBe('high');
    expect(poolConfig.rotation?.sota?.order).toEqual(SOTA_ORDER);
    expect(poolConfig.server_keys[0]).toMatch(/^[0-9a-f]{64}$/);

    const directConfig = JSON.parse(readFileSync(configs.directConfigPath, 'utf8'));
    expect(directConfig.prefer).toBe('zen');
    expect(directConfig.rotation?.sota?.order).toEqual(SOTA_ORDER);
    expect(directConfig.server_keys[0]).toMatch(/^[0-9a-f]{64}$/);

    // proxy config (config/config.json) must also have rotation and zen
    const proxyConfig = JSON.parse(readFileSync(configs.proxyConfigPath, 'utf8'));
    expect(proxyConfig.prefer).toBe('zen');
    expect(proxyConfig.rotation?.sota?.order).toBeDefined();
  });

  it('generates a valid hex-64 server key and persists it across calls', () => {
    const ocHome = join(tempDir, 'oc-gateway-key');
    const key1 = ensureServerKey(ocHome);
    expect(key1).toMatch(/^[0-9a-f]{64}$/);

    // Second call must return the same key (persistence)
    const key2 = ensureServerKey(ocHome);
    expect(key2).toBe(key1);
  });

  it('uses provided hex-64 apiKey as server_key without generating a new one', () => {
    const ocHome = join(tempDir, 'oc-gateway-provided');
    const hexKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const configs = generateGatewayConfigs({
      ocHome,
      proxyPort: 18080,
      poolPort: 18082,
      directPort: 18084,
      apiKey: hexKey,
    });
    const poolConfig = JSON.parse(readFileSync(configs.poolConfigPath, 'utf8'));
    expect(poolConfig.server_keys[0]).toBe(hexKey);
  });
});
