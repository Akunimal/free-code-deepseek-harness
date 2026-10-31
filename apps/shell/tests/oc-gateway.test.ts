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
  probeExistingLocalGateway,
  detectSystemCapabilities,
  getOptimalPoolSize,
  GatewayManager,
  syncScriptsFromLocalAI,
  type OcGatewayRuntimeConfigs,
} from '../src/main/oc-gateway.js';
import { launchHiddenSync } from '../src/main/freecode-launcher.js';

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
      poolSize: 4,
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
    expect(directConfig.warp.enabled).toBe(false);
    expect(directConfig.warp.pool_size).toBe(0);
    expect(directConfig.performance.attempt_timeout_seconds).toBe(35);
    expect(directConfig.performance.first_event_timeout_seconds).toBe(30);
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
      'deepseek-v4.1-flash',
      'glm-5.3',
      'grok-4.6',
      'kimi-k3',
      'qwen3.8-max',
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

  it('opencode2api binary accepts generated pool config without configuration error', () => {
    const ocHome = join(tempDir, 'oc-gateway-bin-check');
    const configs = generateGatewayConfigs({
      ocHome,
      proxyPort: 18080,
      poolPort: 18082,
      directPort: 18084,
      apiKey: '4306f6d5bd4759227eaab21bb4dd9a95aaae75f27ad146ba85a6a9ce6f4ac5f9',
    });
    const binPath = join(__dirname, '../resources/freecode/opencode2api/opencode2api-win-x64.exe');
    if (!existsSync(binPath)) return;

    const proc = launchHiddenSync({
      executable: binPath,
      args: ['-config', configs.poolConfigPath, '-listen', '127.0.0.1:0'],
      timeout: 1500,
    });
    const output = `${proc.stderr ?? ''}${proc.stdout ?? ''}`;
    expect(output).not.toContain('ERROR configuration error');
  });

  it('probeExistingLocalGateway returns null when FREECODE_FORCE_EMBEDDED_GATEWAY=1', async () => {
    const orig = process.env.FREECODE_FORCE_EMBEDDED_GATEWAY;
    try {
      process.env.FREECODE_FORCE_EMBEDDED_GATEWAY = '1';
      const result = await probeExistingLocalGateway(100);
      expect(result).toBeNull();
    } finally {
      if (orig === undefined) delete process.env.FREECODE_FORCE_EMBEDDED_GATEWAY;
      else process.env.FREECODE_FORCE_EMBEDDED_GATEWAY = orig;
    }
  });

  it('probeExistingLocalGateway detects existing local gateway when reachable', async () => {
    // If port 8080 or 8088 is alive on localhost, probe should return valid url
    const result = await probeExistingLocalGateway(500);
    if (result) {
      expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:(8080|8088)\/v1$/);
      expect([8080, 8088]).toContain(result.port);
    }
  });

  it('detectSystemCapabilities and getOptimalPoolSize calculate bounded pool sizes', () => {
    const caps = detectSystemCapabilities();
    expect(caps.cpuCores).toBeGreaterThan(0);
    expect(caps.memoryGB).toBeGreaterThan(0);
    expect(['slow', 'medium', 'fast']).toContain(caps.networkSpeed);

    const poolSize = getOptimalPoolSize(caps);
    expect(poolSize).toBeGreaterThanOrEqual(4);
    expect(poolSize).toBeLessThanOrEqual(16);

    // Explicit speed profiles
    expect(getOptimalPoolSize({ cpuCores: 2, memoryGB: 4, networkSpeed: 'slow' })).toBe(4);
    expect(getOptimalPoolSize({ cpuCores: 8, memoryGB: 16, networkSpeed: 'medium' })).toBe(8);
    expect(getOptimalPoolSize({ cpuCores: 16, memoryGB: 32, networkSpeed: 'fast' })).toBe(16);
  });

  it('syncScriptsFromLocalAI writes metadata and copies available scripts', async () => {
    const targetDir = join(tempDir, 'synced-scripts');
    mkdirSync(targetDir, { recursive: true });

    await syncScriptsFromLocalAI(targetDir);

    const metaFile = join(targetDir, 'sync-metadata.json');
    expect(existsSync(metaFile)).toBe(true);
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    expect(meta.version).toBe('2.1.0');
    expect(meta.sourceHash).toBe('local-ai-1.4.5');
    expect(meta.files).toContain('proxy.js');
  });

  it('GatewayManager initializes and cleans up health monitoring', async () => {
    const manager = new GatewayManager();
    const url = await manager.initialize();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    const instance = manager.getInstance();
    expect(instance).toBeDefined();
    expect(instance?.url).toBe(url);

    expect(() => manager.cleanup()).not.toThrow();
  });
});
