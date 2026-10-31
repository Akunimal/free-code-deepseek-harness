import type { ChildProcess } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  openSync,
  closeSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { cpus, totalmem } from 'node:os';
import { launchHidden, launchHiddenSync } from './freecode-launcher.js';
import { nodeRuntimeEnv, resolveNodePath } from './resource-paths.js';

// ===========================================================================
// FASE 0: Detección de Capacidad del Sistema & Interfaces
// ===========================================================================

export interface SystemCapabilities {
  cpuCores: number;
  memoryGB: number;
  networkSpeed: 'slow' | 'medium' | 'fast';
}

export interface GatewayHealth {
  url: string;
  healthy: boolean;
  latency: number;
  activeRequests: number;
  lastSuccess: number;
  canInfer: boolean;
}

export function detectSystemCapabilities(): SystemCapabilities {
  const cpuCores = cpus().length;
  const memoryGB = Math.round(totalmem() / (1024 * 1024 * 1024));
  const networkSpeed =
    cpuCores >= 8 && memoryGB >= 16 ? 'fast' : cpuCores >= 4 && memoryGB >= 8 ? 'medium' : 'slow';
  console.log(`[System] Detectado: ${cpuCores} cores, ${memoryGB}GB RAM, red ${networkSpeed}`);
  return { cpuCores, memoryGB, networkSpeed };
}

export function getOptimalPoolSize(capabilities: SystemCapabilities): number {
  let poolSize = 4;
  if (capabilities.networkSpeed === 'fast') {
    poolSize = Math.min(16, capabilities.cpuCores * 2);
  } else if (capabilities.networkSpeed === 'medium') {
    poolSize = Math.min(8, capabilities.cpuCores);
  }
  console.log(`[PoolSize] Configurado: ${poolSize} túneles`);
  return poolSize;
}

// ===========================================================================
// FASE 1: Detección Inteligente de Gateway Local
// ===========================================================================

export async function testModelAvailability(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${url}/v1/models`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export async function probeGateway(url: string): Promise<GatewayHealth> {
  const startTime = Date.now();
  const empty: GatewayHealth = {
    url,
    healthy: false,
    latency: 0,
    activeRequests: 0,
    lastSuccess: 0,
    canInfer: false,
  };

  try {
    // Health check con timeout de 2s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const healthResponse = await fetch(`${url}/healthz`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!healthResponse.ok) {
      // Fallback a /health (usado por mimo-router :8088)
      try {
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 1000);
        const h2 = await fetch(`${url}/health`, { signal: c2.signal });
        clearTimeout(t2);
        if (!h2.ok) return empty;
      } catch {
        return empty;
      }
    }

    // Verificar capacidad (endpoint opcional)
    let activeRequests = 0;
    try {
      const ctrl2 = new AbortController();
      const tid2 = setTimeout(() => ctrl2.abort(), 1000);
      const statsResponse = await fetch(`${url}/stats`, { signal: ctrl2.signal });
      clearTimeout(tid2);
      if (statsResponse.ok) {
        const stats = (await statsResponse.json()) as { activeRequests?: number };
        activeRequests = stats.activeRequests || 0;
      }
    } catch {
      /* endpoint opcional */
    }

    // Verificar disponibilidad de modelos (sin hacer inferencia ni quemar cuota)
    const canInfer = await testModelAvailability(url);

    return {
      url,
      healthy: true,
      latency: Date.now() - startTime,
      activeRequests,
      lastSuccess: Date.now(),
      canInfer,
    };
  } catch {
    return empty;
  }
}

export async function detectBestGateway(): Promise<GatewayHealth | null> {
  if (process.env.FREECODE_FORCE_EMBEDDED_GATEWAY === '1') {
    console.log('[Detect] FREECODE_FORCE_EMBEDDED_GATEWAY activo; omitiendo gateways locales');
    return null;
  }

  const candidates = [
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8088',
    'http://127.0.0.1:8084',
    'http://127.0.0.1:8082',
  ];

  console.log('[Detect] Probando gateways locales...');
  const results = await Promise.all(candidates.map(probeGateway));

  const healthy = results.filter((g) => g.healthy && g.canInfer && g.activeRequests < 10);

  if (healthy.length === 0) {
    console.log('[Detect] No se encontraron gateways locales disponibles');
    return null;
  }

  // Priorizar: menor carga → menor latencia → éxito más reciente
  healthy.sort((a, b) => {
    if (a.activeRequests !== b.activeRequests) return a.activeRequests - b.activeRequests;
    if (a.latency !== b.latency) return a.latency - b.latency;
    return b.lastSuccess - a.lastSuccess;
  });

  const best = healthy[0];
  if (!best) {
    return null;
  }

  console.log(
    `[Detect] Mejor gateway: ${best.url} (latencia: ${best.latency}ms, requests: ${best.activeRequests})`
  );
  return best;
}

export interface ExistingGatewayProbeResult {
  url: string;
  baseUrl: string;
  port: number;
}

/**
 * Backward compatibility alias for probeGateway/detectBestGateway
 */
export async function probeExistingLocalGateway(
  timeoutMs = 800
): Promise<ExistingGatewayProbeResult | null> {
  if (process.env.FREECODE_FORCE_EMBEDDED_GATEWAY === '1') {
    return null;
  }
  const best = await detectBestGateway();
  if (best) {
    const parsed = new URL(best.url);
    const port = parseInt(parsed.port || '80', 10);
    return {
      url: `${best.url}/v1`,
      baseUrl: best.url,
      port,
    };
  }
  return null;
}

// ===========================================================================
// FASE 2: GatewayManager (Health Monitoring + Failover)
// ===========================================================================

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

export class GatewayManager {
  private currentGateway: GatewayHealth | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private fallbackToEmbedded = false;
  private embeddedPort: number | null = null;
  private embeddedDirectPort: number | null = null;
  private embeddedWarpPort: number | null = null;
  private activeInstance: OcGatewayInstance | null = null;
  private config?: OcGatewayConfig;

  constructor(config?: OcGatewayConfig) {
    this.config = config;
  }

  setConfig(config: OcGatewayConfig): void {
    this.config = config;
  }

  async initialize(config?: OcGatewayConfig): Promise<string> {
    if (config) this.config = config;

    // Intentar reutilizar gateway local existente
    const gateway = await detectBestGateway();

    if (gateway) {
      this.currentGateway = gateway;
      console.log(`[GatewayManager] ✅ Usando gateway local: ${gateway.url}`);
      this.startHealthMonitoring();
      const port = parseInt(new URL(gateway.url).port || '80', 10);
      const modelIds = this.config?.resourcesDir
        ? loadModelIds(this.config.resourcesDir)
        : ['deepseek-v4.1-flash-free'];
      this.activeInstance = {
        url: `${gateway.url}/v1`,
        baseUrl: gateway.url,
        port,
        apiKey: this.config?.apiKey || 'freecode-internal-key',
        modelIds,
        pids: [],
        stop: async () => {},
        restart: async () => {},
      };
      return `${gateway.url}/v1`;
    }

    // Fallback: levantar stack embebido
    console.log('[GatewayManager] ⚠️ No hay gateway local, levantando stack embebido...');
    this.fallbackToEmbedded = true;
    await this.startEmbeddedStack();
    return `http://127.0.0.1:${this.embeddedPort}/v1`;
  }

  getInstance(): OcGatewayInstance | null {
    return this.activeInstance;
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

    this.healthCheckInterval = setInterval(async () => {
      if (!this.currentGateway) return;

      const health = await probeGateway(this.currentGateway.url);

      if (!health.healthy || !health.canInfer) {
        console.warn(`[GatewayManager] ⚠️ Gateway ${this.currentGateway.url} cayó, iniciando failover...`);
        await this.handleGatewayFailure();
      } else {
        this.currentGateway = health;
      }
    }, 30000); // 30 segundos

    console.log('[GatewayManager] Health monitoring iniciado (cada 30s)');
  }

  private async handleGatewayFailure(): Promise<void> {
    const newGateway = await detectBestGateway();

    if (newGateway && newGateway.url !== this.currentGateway?.url) {
      this.currentGateway = newGateway;
      console.log(`[GatewayManager] ✅ Failover exitoso a ${newGateway.url}`);
      if (this.activeInstance) {
        this.activeInstance.url = `${newGateway.url}/v1`;
        this.activeInstance.baseUrl = newGateway.url;
        this.activeInstance.port = parseInt(new URL(newGateway.url).port || '80', 10);
      }
    } else {
      console.log('[GatewayManager] Activando stack embebido como último recurso...');
      this.fallbackToEmbedded = true;
      this.stopHealthMonitoring();
      await this.startEmbeddedStack();
    }
  }

  async startEmbeddedStack(): Promise<void> {
    if (!this.config) {
      throw new Error('[GatewayManager] Cannot start embedded stack without OcGatewayConfig');
    }
    const capabilities = detectSystemCapabilities();
    const poolSize = getOptimalPoolSize(capabilities);

    // Solicitar puertos dinámicos libres al OS (:0)
    this.embeddedPort = await this.getAvailablePort();
    this.embeddedDirectPort = await this.getAvailablePort();
    this.embeddedWarpPort = await this.getAvailablePort();

    console.log(
      `[GatewayManager] Puertos asignados: proxy=${this.embeddedPort}, direct=${this.embeddedDirectPort}, warp=${this.embeddedWarpPort}`
    );
    console.log(`[GatewayManager] Stack embebido levantado con pool_size=${poolSize}`);

    this.activeInstance = await startEmbeddedOcGateway({
      config: this.config,
      proxyPort: this.embeddedPort,
      poolPort: this.embeddedWarpPort,
      directPort: this.embeddedDirectPort,
      poolSize,
    });
  }

  async getAvailablePort(): Promise<number> {
    return findFreePort('127.0.0.1');
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[GatewayManager] Health monitoring detenido');
    }
  }

  cleanup(): void {
    this.stopHealthMonitoring();
    if (this.activeInstance) {
      void this.activeInstance.stop();
      this.activeInstance = null;
    }
    console.log('[GatewayManager] Cleanup completado');
  }
}

export const globalGatewayManager = new GatewayManager();

// ===========================================================================
// FASE 3: Sincronización de Scripts desde C:\LocalAI
// ===========================================================================

export async function syncScriptsFromLocalAI(targetDir?: string): Promise<void> {
  const sourcePath = 'C:\\LocalAI\\opencode-gateway\\scripts';
  const targetPath =
    targetDir || join(process.cwd(), 'apps', 'shell', 'resources', 'freecode', 'oc-gateway', 'scripts');

  const requiredFiles = [
    'proxy.js',
    'chat-coordinator.js',
    'chat-upstream.js',
    'mimo-sanitizer.js',
    'sse-parser.js',
  ];

  console.log('[Sync] Sincronizando scripts desde C:\\LocalAI...');

  for (const file of requiredFiles) {
    const source = join(sourcePath, file);
    const target = join(targetPath, file);

    try {
      if (existsSync(source)) {
        copyFileSync(source, target);
        console.log(`[Sync] ✅ Copiado: ${file}`);
      } else {
        console.warn(`[Sync] ⚠️ No encontrado: ${file}`);
      }
    } catch (error: any) {
      console.error(`[Sync] ❌ Error copiando ${file}:`, error.message);
    }
  }

  // Guardar metadata de sincronización
  const metadata = {
    version: '2.1.0',
    lastSync: new Date().toISOString(),
    sourceHash: 'local-ai-1.4.5',
    files: requiredFiles,
  };

  try {
    writeFileSync(join(targetPath, 'sync-metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
    console.log('[Sync] Metadata guardada en sync-metadata.json');
  } catch (error: any) {
    console.error('[Sync] Error guardando metadata:', error.message);
  }
}

// ===========================================================================
// FASE 4: Configuraciones Auto-Adaptativas y Stack Embebido
// ===========================================================================

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

export function saveProcessPids(ocHome: string, pids: number[]): void {
  mkdirSync(ocHome, { recursive: true });
  writeFileSync(join(ocHome, 'pids.json'), JSON.stringify({ pids, timestamp: Date.now() }, null, 2), 'utf8');
}

export function cleanupZombieProcesses(ocHome: string): void {
  const pidFile = join(ocHome, 'pids.json');
  if (!existsSync(pidFile)) return;
  try {
    const { pids } = JSON.parse(readFileSync(pidFile, 'utf8')) as { pids: number[] };
    if (Array.isArray(pids)) {
      for (const pid of pids) {
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

const SOTA_ROTATION_ORDER = [
  'deepseek-v4.1-flash',
  'glm-5.3',
  'grok-4.6',
  'kimi-k3',
  'qwen3.8-max',
] as const;

export function generateGatewayConfigs(params: {
  ocHome: string;
  proxyPort: number;
  poolPort: number;
  directPort: number;
  apiKey: string;
  poolSize?: number;
}): OcGatewayRuntimeConfigs {
  const { ocHome, poolPort, directPort, apiKey, poolSize } = params;
  const capabilities = detectSystemCapabilities();
  const effectivePoolSize =
    typeof poolSize === 'number' && poolSize > 0 ? poolSize : getOptimalPoolSize(capabilities);

  const dataDir = join(ocHome, 'data');
  const configDir = join(ocHome, 'config');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });

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
      pool_size: effectivePoolSize,
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
    performance: {
      ...poolConfig.performance,
      attempt_timeout_seconds: 35,
      first_event_timeout_seconds: 30,
    },
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

export async function startEmbeddedOcGateway(params: {
  config: OcGatewayConfig;
  proxyPort?: number;
  poolPort?: number;
  directPort?: number;
  poolSize?: number;
}): Promise<OcGatewayInstance> {
  const { config, poolSize } = params;
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
    params.proxyPort ? Promise.resolve(params.proxyPort) : findFreePort('127.0.0.1'),
    params.poolPort ? Promise.resolve(params.poolPort) : findFreePort('127.0.0.1'),
    params.directPort ? Promise.resolve(params.directPort) : findFreePort('127.0.0.1'),
  ]);

  const apiKey = config.apiKey || 'freecode-internal-key';

  // 4. Generate runtime configs
  const { poolConfigPath, directConfigPath } = generateGatewayConfigs({
    ocHome,
    proxyPort,
    poolPort,
    directPort,
    apiKey,
    poolSize,
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
        await startEmbeddedOcGateway(params);
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

/**
 * Entry point for starting the OpenCode Gateway via GatewayManager
 */
export async function startOcGateway(config: OcGatewayConfig): Promise<OcGatewayInstance> {
  globalGatewayManager.setConfig(config);
  await globalGatewayManager.initialize(config);
  const instance = globalGatewayManager.getInstance();
  if (!instance) {
    throw new Error('oc-gateway: GatewayManager failed to produce an active instance');
  }
  return instance;
}
