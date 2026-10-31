import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { launchHidden, launchHiddenSync } from './freecode-launcher.js';
import { nodeRuntimeEnv, resolveNodePath } from './resource-paths.js';

export interface OcGatewayConfig {
  resourcesDir: string;
  userDataDir: string;
  apiKey?: string;
  readyTimeoutMs?: number;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
  packaged?: boolean;
}

export interface OcGatewayInstance {
  url: string; // http://127.0.0.1:<proxyPort>/v1
  baseUrl: string; // http://127.0.0.1:<proxyPort>
  port: number;
  apiKey: string;
  modelIds: readonly string[];
  readonly pids: readonly number[];
  stop(): Promise<void>;
  restart(): Promise<void>;
}

export interface OcGatewayRuntimeConfigs {
  poolConfigPath: string;
  directConfigPath: string;
  proxyConfigPath: string;
}

const DEFAULT_READY_TIMEOUT_MS = 60_000;
const READY_POLL_INTERVAL_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function findFreePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('oc-gateway: could not determine allocated numeric port'));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Ensures a persistent canonical OpenCode session token (`ses_...`) exists.
 * Preserved across restarts to maintain client device fingerprint and quota continuity.
 */
export function ensureCanonicalSession(ocHome: string): string {
  const sessionPath = join(ocHome, 'session.json');
  try {
    if (existsSync(sessionPath)) {
      const data = JSON.parse(readFileSync(sessionPath, 'utf8'));
      if (typeof data.sessionId === 'string' && /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(data.sessionId)) {
        return data.sessionId;
      }
    }
  } catch {
    // re-create below
  }

  mkdirSync(ocHome, { recursive: true });
  // Format: ses_ + 12 hex chars (timestamp-based) + 14 alphanumeric chars
  const hexPart = Date.now().toString(16).padStart(12, '0').slice(-12);
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(14);
  let randPart = '';
  for (let i = 0; i < 14; i++) {
    const byte = bytes[i] ?? 0;
    randPart += chars[byte % chars.length] ?? '0';
  }
  const sessionId = `ses_${hexPart}${randPart}`;
  writeFileSync(sessionPath, JSON.stringify({ sessionId, createdAt: new Date().toISOString() }, null, 2), 'utf8');
  return sessionId;
}

/**
 * Saves running PIDs to prevent Windows zombies if Electron crashes or shuts down abruptly.
 */
export function saveProcessPids(ocHome: string, pids: number[]): void {
  mkdirSync(ocHome, { recursive: true });
  writeFileSync(join(ocHome, 'pids.json'), JSON.stringify({ pids, timestamp: Date.now() }, null, 2), 'utf8');
}

/**
 * Cleans up any leftover processes from previous crashes.
 */
export function cleanupZombieProcesses(ocHome: string): void {
  const pidFile = join(ocHome, 'pids.json');
  if (!existsSync(pidFile)) return;
  try {
    const data = JSON.parse(readFileSync(pidFile, 'utf8'));
    if (Array.isArray(data.pids)) {
      for (const pid of data.pids) {
        if (typeof pid === 'number' && pid > 0) {
          try {
            if (process.platform === 'win32') {
              launchHiddenSync({
                executable: 'taskkill',
                args: ['/F', '/PID', String(pid), '/T'],
                timeout: 5000,
              });
            } else {
              process.kill(pid, 'SIGKILL');
            }
          } catch {
            // Process may already be dead
          }
        }
      }
    }
  } catch {
    // Ignore read/kill errors
  } finally {
    try {
      rmSync(pidFile, { force: true });
    } catch {
      // Ignore removal failure
    }
  }
}

/**
 * Ensures a persistent server key (64 hex chars) exists in the gateway config dir.
 * Reuses the persisted key across restarts to avoid re-registration on every launch.
 */
export function ensureServerKey(ocHome: string): string {
  const configDir = join(ocHome, 'config');
  const keyPath = join(configDir, 'server-key.json');
  try {
    if (existsSync(keyPath)) {
      const { key } = JSON.parse(readFileSync(keyPath, 'utf8')) as { key: string };
      if (typeof key === 'string' && /^[0-9a-f]{64}$/.test(key)) return key;
    }
  } catch {
    // fall through to generate
  }
  mkdirSync(configDir, { recursive: true });
  const key = randomBytes(32).toString('hex');
  writeFileSync(keyPath, JSON.stringify({ key, createdAt: new Date().toISOString() }, null, 2), 'utf8');
  return key;
}

/** Model rotation chain — mirrors C:\LocalAI config.json rotation.sota.order */
const SOTA_ROTATION_ORDER = [
  'deepseek-v4.1-flash-free',
  'glm-5.3-flash-free',
  'minimax-m3.1-flash-free',
  'mimo-v2.6-flash-free',
  'big-pickle',
] as const;

/**
 * Generates runtime configs in user data directory, enforcing loopback 127.0.0.1.
 * Configs are aligned with C:\LocalAI: prefer zen, reasoning high, sota rotation.
 */
export function generateGatewayConfigs(params: {
  ocHome: string;
  proxyPort: number;
  poolPort: number;
  directPort: number;
  apiKey: string;
}): OcGatewayRuntimeConfigs {
  const { ocHome, poolPort, directPort, apiKey } = params;
  const dataDir = join(ocHome, 'data');
  const configDir = join(ocHome, 'config');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });

  // Use provided hex-64 key or generate/reuse a persistent one
  const serverKey = /^[0-9a-f]{64}$/.test(apiKey) ? apiKey : ensureServerKey(ocHome);

  const poolConfig = {
    listen: `127.0.0.1:${poolPort}`,
    server_keys: [serverKey],
    zen_keys: [],
    go_keys: [],
    anonymous: true,
    prefer: 'zen',
    reasoning: { effort: 'high' },
    rotation: {
      sota: {
        alias: 'sota',
        order: [...SOTA_ROTATION_ORDER],
      },
      sweet: { alias: 'sweet', order: [] as string[] },
      first_output_seconds: 30,
    },
    warp: {
      enabled: true,
      pool_size: 4,
    },
    proxies: ['direct'],
    proxyfile: '',
    upstream: {
      zen: 'https://opencode.ai/zen',
      go: 'https://opencode.ai/zen/go',
      anonymous: 'https://opencode.ai/inference',
    },
    retry: { max_attempts: 1, timeout_seconds: 645 },
    models: { refresh_seconds: 300, protocols: {}, free_only: true },
    performance: {
      max_idle_conns: 2048,
      max_idle_conns_per_host: 256,
      max_conns_per_host: 0,
      idle_conn_timeout_seconds: 120,
      connect_timeout_seconds: 10,
      failure_cooldown_seconds: 2,
      attempt_timeout_seconds: 45,
      first_event_timeout_seconds: 40,
    },
    logging: { level: 'info', ring_size: 2000, dump_request_bodies: false },
    webui: { enabled: false, listen: '127.0.0.1:0', username: 'local', session_ttl_minutes: 720 },
  };

  const directConfig = {
    ...poolConfig,
    listen: `127.0.0.1:${directPort}`,
    warp: { enabled: false, pool_size: 0 },
  };

  const poolConfigPath = join(dataDir, 'pool-config.json');
  const directConfigPath = join(dataDir, 'direct-config.json');
  const proxyConfigPath = join(configDir, 'config.json');

  writeFileSync(poolConfigPath, JSON.stringify(poolConfig, null, 2), 'utf8');
  writeFileSync(directConfigPath, JSON.stringify(directConfig, null, 2), 'utf8');
  writeFileSync(proxyConfigPath, JSON.stringify(poolConfig, null, 2), 'utf8');

  return { poolConfigPath, directConfigPath, proxyConfigPath };
}

export function loadModelIds(resourcesDir: string): string[] {
  const defaultModels = [
    'deepseek-v4.1-flash-free',
    'glm-5.3-flash-free',
    'minimax-m3.1-flash-free',
    'beam-free',
    'flint-40b-free',
    'mimo-v2.6-flash-free',
  ];

  const modelsPath = join(resourcesDir, 'oc-gateway/config/models.json');
  try {
    if (existsSync(modelsPath)) {
      const data = JSON.parse(readFileSync(modelsPath, 'utf8'));
      if (data && typeof data.models === 'object' && data.models !== null) {
        const keys = Object.keys(data.models);
        if (keys.length > 0) {
          // Put deepseek-v4.1-flash-free at the beginning if present
          const sorted = keys.filter((k) => k !== 'deepseek-v4.1-flash-free');
          if (keys.includes('deepseek-v4.1-flash-free')) {
            sorted.unshift('deepseek-v4.1-flash-free');
          }
          return sorted;
        }
      }
    }
  } catch {
    // fallback
  }
  return defaultModels;
}

/**
 * Starts the self-contained opencode2api gateway stack:
 * - Worker 1: Direct backend (127.0.0.1:directPort)
 * - Worker 2: Multi-WARP pool backend (127.0.0.1:poolPort)
 * - Ingress: Node.js proxy sanitizador & coordinator (127.0.0.1:proxyPort)
 */
export async function startOcGateway(config: OcGatewayConfig): Promise<OcGatewayInstance> {
  const log = config.log ?? (() => {});
  const packaged = config.packaged ?? false;
  const ocHome = join(config.userDataDir, 'oc-gateway');
  const logsDir = join(config.userDataDir, 'logs', 'oc-gateway');
  mkdirSync(ocHome, { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  // 1. Anti-zombie cleanup from previous runs
  cleanupZombieProcesses(ocHome);

  // 2. Persistent canonical session
  const sessionId = ensureCanonicalSession(ocHome);

  // 3. Dynamic loopback port allocation
  const [proxyPort, poolPort, directPort] = await Promise.all([
    findFreePort('127.0.0.1'),
    findFreePort('127.0.0.1'),
    findFreePort('127.0.0.1'),
  ]);

  const apiKey = config.apiKey || 'freecode-internal-key';

  // 4. Generate runtime configs
  const { poolConfigPath, directConfigPath } = generateGatewayConfigs({
    ocHome,
    proxyPort,
    poolPort,
    directPort,
    apiKey,
  });

  const binPath = join(config.resourcesDir, 'opencode2api', 'opencode2api-win-x64.exe');
  if (!existsSync(binPath)) {
    throw new Error(`opencode2api binary not found at ${binPath}`);
  }

  const proxyScriptPath = join(config.resourcesDir, 'oc-gateway', 'scripts', 'proxy.js');
  if (!existsSync(proxyScriptPath)) {
    throw new Error(`proxy.js script not found at ${proxyScriptPath}`);
  }

  // 5. Open log file descriptors
  const poolLogFd = openSync(join(logsDir, 'pool.log'), 'a');
  const directLogFd = openSync(join(logsDir, 'direct.log'), 'a');
  const proxyLogFd = openSync(join(logsDir, 'proxy.log'), 'a');

  const children: ChildProcess[] = [];

  try {
    // Launch WARP Pool worker
    const poolProc = launchHidden({
      executable: binPath,
      args: ['-config', poolConfigPath, '-listen', `127.0.0.1:${poolPort}`],
      cwd: ocHome,
      stdio: ['ignore', poolLogFd, poolLogFd],
    }).proc;
    children.push(poolProc);

    // Launch Direct worker
    const directProc = launchHidden({
      executable: binPath,
      args: ['-config', directConfigPath, '-listen', `127.0.0.1:${directPort}`],
      cwd: ocHome,
      stdio: ['ignore', directLogFd, directLogFd],
    }).proc;
    children.push(directProc);

    // Launch Proxy using Electron's node runtime
    const nodeExecutable = resolveNodePath({ packaged });
    const nodeEnv = nodeRuntimeEnv(packaged);

    const proxyProc = launchHidden({
      executable: nodeExecutable,
      args: [proxyScriptPath],
      cwd: ocHome,
      env: {
        ...process.env,
        ...nodeEnv,
        PROXY_PORT: String(proxyPort),
        GATEWAY_PORT: String(poolPort),
        DIRECT_GATEWAY_PORT: String(directPort),
        OC_GATEWAY_HOME: ocHome,
        OC_CANONICAL_SESSION: sessionId,
      },
      stdio: ['ignore', proxyLogFd, proxyLogFd],
    }).proc;
    children.push(proxyProc);

    const activePids = children.map((c) => c.pid).filter((pid): pid is number => typeof pid === 'number');
    saveProcessPids(ocHome, activePids);

    // 6. Wait for proxy healthz
    const readyTimeout = config.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    const startTime = Date.now();
    let isHealthy = false;

    while (Date.now() - startTime < readyTimeout) {
      try {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/healthz`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.status === 200 || res.status === 503) {
          isHealthy = true;
          break;
        }
      } catch {
        // Continue polling
      }
      await sleep(READY_POLL_INTERVAL_MS);
    }

    if (!isHealthy) {
      throw new Error(`oc-gateway proxy failed to answer healthz within ${readyTimeout}ms`);
    }

    const modelIds = loadModelIds(config.resourcesDir);

    const stop = async (): Promise<void> => {
      for (const child of children) {
        try {
          if (typeof child.pid === 'number') {
            if (process.platform === 'win32') {
              launchHiddenSync({
                executable: 'taskkill',
                args: ['/F', '/PID', String(child.pid), '/T'],
                timeout: 5000,
              });
            } else {
              child.kill('SIGKILL');
            }
          }
        } catch {
          // ignore kill errors on exit
        }
      }
      try {
        closeSync(poolLogFd);
        closeSync(directLogFd);
        closeSync(proxyLogFd);
      } catch {
        // ignore fd close errors
      }
      try {
        rmSync(join(ocHome, 'pids.json'), { force: true });
      } catch {
        // ignore
      }
    };

    return {
      url: `http://127.0.0.1:${proxyPort}/v1`,
      baseUrl: `http://127.0.0.1:${proxyPort}`,
      port: proxyPort,
      apiKey,
      modelIds,
      pids: activePids,
      stop,
      restart: async () => {
        await stop();
        await startOcGateway(config);
      },
    };
  } catch (err) {
    for (const child of children) {
      try {
        if (child.pid) child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
    throw err;
  }
}
