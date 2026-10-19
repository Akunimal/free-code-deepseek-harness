import { HarnessSupervisor, HarnessInstance } from './harness-supervisor.js';
import { SecretStore, resolveSecrets } from './secret-store.js';
import { join, resolve } from 'node:path';
import { retireRemovedRuntime } from './retired-runtime.js';
import { startOpencode2api, type Opencode2apiInstance } from './opencode2api.js';
import { ProxyRotator } from './proxy-rotator.js';
import { embeddedMcpEnvironment, ensureEmbeddedMcpConfig } from './mcp-home.js';
import type { EmbeddedMcpState, McpRuntimeStatus, WorkerHandle } from '@freecode/shared-types';

/**
 * Shell runtime — owns the full backend stack of the desktop app:
 *   opencode2api (anonymous Zen) -> dsh web supervisor.
 */

export interface ShellRuntimeConfig {
  /** Static resources dir containing sidecars such as opencode2api and OCR. */
  resourcesDir: string;
  /** Root containing the DSH CLI; defaults to resourcesDir for development. */
  harnessDir?: string;
  /** Node binary used to run the dsh CLI. */
  nodePath: string;
  /** User data dir (DSH_HOME + worker logs). */
  userDataDir: string;
  /** Secret vault; apiKeyEnv refs are resolved into spawn env (not process.env). */
  secrets?: SecretStore;
  /** Env var names to resolve from the vault into the harness child env. */
  secretEnvNames?: string[];
  /** Runtime env needed by a packaged Electron child process. */
  nodeEnv?: Record<string, string>;
  /** Optional logging callback forwarded to the supervisor. */
  log?: (level: string, msg: string, meta?: Record<string, unknown>) => void;
  /** Additional stable environment for the bundled Harness web client. */
  extraEnv?: Record<string, string>;
  /** Authenticated loopback bridge for the visible persistent browser. */
  browserBridge?: { endpoint: string; token: string };
  /** Absolute uvx executable selected by the platform bootstrap. */
  uvxCommand?: string;
  /** Called after the egress proxy pool changes and the gateway has reloaded. */
  onProxyPoolChanged?: () => void;
  /** Stage changes of the egress proxy rotation, for user-visible status. */
  onProxyRotationStatus?: (status: 'harvesting' | 'ready' | 'empty', healthy: number) => void;
}

export type McpStatusListener = (status: McpRuntimeStatus) => void;

export interface ShellRuntime {
  /** opencode2api anonymous-Zen instance; undefined when unavailable. */
  opencode2api?: Opencode2apiInstance;
  supervisor: HarnessSupervisor;
  /** No per-worker handles; returns empty array. */
  workers: () => WorkerHandle[];
  /** Current managed MCP config plus live connection evidence. */
  mcpState(): EmbeddedMcpState;
  /** Re-read the product-managed MCP file before showing settings. */
  refreshMcpState(): EmbeddedMcpState;
  /** Reset enabled servers to starting before a supervisor restart. */
  resetMcpStatus(): void;
  onMcpStatus(listener: McpStatusListener): () => void;
  /** Engage egress proxy rotation (idempotent). Called when the direct lane is
   *  persistently blocked. A no-op when the gateway is down or rotation is
   *  disabled. */
  engageProxyRotation(): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createShellRuntime(cfg: ShellRuntimeConfig): Promise<ShellRuntime> {
  void retireRemovedRuntime(cfg.userDataDir).catch(error => cfg.log?.('warn', 'retired runtime cleanup deferred', { error: String(error) }));
  const ocrEnv: Record<string, string> = process.platform === 'win32'
    ? {
        FREECODE_TESSERACT_PATH: join(cfg.resourcesDir, 'tesseract', 'tesseract.exe'),
        FREECODE_TESSDATA_PREFIX: join(cfg.resourcesDir, 'tesseract', 'tessdata'),
      }
    : {};
  let mcpEnv: Record<string, string> = { FREECODE_WEB_MODE: '1', ...ocrEnv };
  const mcpHome = join(cfg.userDataDir, 'dsh-home');
  let mcpCatalog: EmbeddedMcpState = { configPath: join(mcpHome, 'mcp', 'servers.json'), servers: [] };
  const mcpStatuses = new Map<string, McpRuntimeStatus>();
  const mcpListeners = new Set<McpStatusListener>();
  const setMcpCatalog = (state: EmbeddedMcpState): void => {
    mcpCatalog = {
      configPath: state.configPath,
      servers: state.servers.map((server) => ({ ...server, args: [...server.args] })),
    };
    for (const server of mcpCatalog.servers) {
      const existing = mcpStatuses.get(server.id);
      if (!server.enabled) {
        mcpStatuses.set(server.id, { serverId: server.id, state: 'disabled', toolCount: 0 });
      } else if (existing === undefined || existing.state === 'disabled') {
        mcpStatuses.set(server.id, { serverId: server.id, state: 'starting', toolCount: 0 });
      }
    }
  };
  const emitMcpStatus = (status: McpRuntimeStatus): void => {
    if (!mcpCatalog.servers.some((server) => server.id === status.serverId)) return;
    const normalized: McpRuntimeStatus = {
      ...status,
      error: status.error?.slice(0, 1_024),
    };
    mcpStatuses.set(status.serverId, normalized);
    for (const listener of mcpListeners) listener(normalized);
  };
  const mcpState = (): EmbeddedMcpState => ({
    configPath: mcpCatalog.configPath,
    servers: mcpCatalog.servers.map((server) => ({
      ...server,
      args: [...server.args],
      runtime: mcpStatuses.get(server.id) ?? {
        serverId: server.id,
        state: server.enabled ? 'starting' : 'disabled',
        toolCount: 0,
      },
    })),
  });
  const resetMcpStatus = (): void => {
    for (const server of mcpCatalog.servers) {
      emitMcpStatus({
        serverId: server.id,
        state: server.enabled ? 'starting' : 'disabled',
        toolCount: 0,
      });
    }
  };
  try {
    const mcp = ensureEmbeddedMcpConfig(mcpHome, {
      uvxCommand: cfg.uvxCommand,
    });
    setMcpCatalog({
      configPath: mcp.configPath,
      servers: mcp.servers.map((server) => ({ ...server, args: [...server.args] })),
    });
    mcpEnv = {
      ...embeddedMcpEnvironment(mcp),
      FREECODE_UVX_COMMAND: cfg.uvxCommand ?? 'uvx',
      // dsh's Cordis logger is intentionally not attached to stdout/stderr in
      // the web profile. The patched MCP bridge emits this bounded status
      // protocol only when the desktop shell opts in, so tray state reflects
      // real initialize -> tools/list -> registration evidence.
      FREECODE_MCP_STATUS_STREAM: 'stderr',
      ...ocrEnv,
    };
    // This is only the persisted catalog becoming available. The actual MCP
    // readiness contract is initialize -> tools/list -> schema validation and
    // is logged by the child connection supervisor after it registers tools.
    cfg.log?.('info', 'embedded MCP catalog configured', { enabled: mcp.enabled, configPath: mcp.configPath });
  } catch (error) {
    // MCP is optional; a config filesystem failure must not prevent the core
    // desktop runtime from starting. The warning remains in the app log.
    cfg.log?.('warn', 'embedded MCP catalog unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const log = cfg.log ? (level: string, msg: string, meta?: Record<string, unknown>) =>
    cfg.log?.(level as 'debug' | 'info' | 'warn' | 'error', msg, meta) : undefined;

  const cliEntry = resolve(join(cfg.harnessDir ?? cfg.resourcesDir, 'dsh', 'apps', 'cli', 'lib', 'bin.js'));
  const secretEnvNames = cfg.secretEnvNames ?? ['FREECODE_PUBLIC_KEY'];
  const extraEnv: Record<string, string> = {};
  if (cfg.secrets) {
    for (const [k, v] of Object.entries(
      await resolveSecrets(cfg.secrets, secretEnvNames),
    )) {
      extraEnv[k] = v;
    }
  }
  // The no-auth gateway authenticates locally with the same public key the
  // harness route uses, so server_keys and apiKeyEnv always agree even when
  // the operator overrode FREECODE_PUBLIC_KEY.
  const publicKey = extraEnv.FREECODE_PUBLIC_KEY ?? process.env.FREECODE_PUBLIC_KEY ?? 'public';
  const opencode2api = await startOpencode2api({
    resourcesDir: join(cfg.resourcesDir),
    userDataDir: cfg.userDataDir,
    apiKey: publicKey,
    log,
  }).catch((error: unknown) => {
    cfg.log?.('warn', 'opencode2api sidecar failed to start', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });

  // Egress rotation, demand-driven: engaged by the shell only when the direct
  // lane is persistently blocked (a non-retryable empty catalog, i.e. Zen's
  // 403 FreeTierError). While the user's own IP works, no proxy list is ever
  // fetched and the gateway is never restarted — direct is always first.
  // Opt-out: FREECODE_DISABLE_PROXY_ROTATION=1.
  const rotationDisabled = process.env.FREECODE_DISABLE_PROXY_ROTATION === '1';
  let proxyRotator: ProxyRotator | undefined;
  if (opencode2api && !rotationDisabled) {
    proxyRotator = new ProxyRotator({
      proxyfilePath: opencode2api.proxyfilePath,
      onStatus: (status, healthy) => cfg.onProxyRotationStatus?.(status, healthy),
      onPoolChanged: async () => {
        await opencode2api.restart();
        // The catalog was probed before the proxies existed; ask for a fresh
        // probe now so the selector updates without waiting for the cadence.
        cfg.onProxyPoolChanged?.();
      },
      log,
    });
  }

  const supervisor = new HarnessSupervisor({
    nodePath: cfg.nodePath,
    cliEntry,
    homeDir: join(cfg.userDataDir, 'dsh-home'),
    lbUrl: opencode2api?.url ?? 'http://127.0.0.1:55405',
    // Product-managed MCP values are authoritative for the child process:
    // they are derived from the persisted catalog, not inherited from the
    // Electron environment. A new harness process reads the current toggles.
    extraEnv: { ...cfg.extraEnv, ...mcpEnv, ...extraEnv },
    browserBridge: cfg.browserBridge,
    nodeEnv: cfg.nodeEnv,
    log,
    onMcpStatus: emitMcpStatus,
  });

  return {
    opencode2api,
    supervisor,
    workers: () => [],
    mcpState,
    refreshMcpState: () => {
      const state = ensureEmbeddedMcpConfig(mcpHome, {
        uvxCommand: cfg.uvxCommand,
      });
      setMcpCatalog({
        configPath: state.configPath,
        servers: state.servers.map((server) => ({ ...server, args: [...server.args] })),
      });
      mcpEnv = {
        ...embeddedMcpEnvironment(state),
        FREECODE_UVX_COMMAND: cfg.uvxCommand ?? 'uvx',
        ...ocrEnv,
      };
      supervisor.updateExtraEnv({ ...cfg.extraEnv, ...mcpEnv, ...extraEnv });
      return mcpState();
    },
    resetMcpStatus,
    onMcpStatus: (listener) => {
      mcpListeners.add(listener);
      return () => mcpListeners.delete(listener);
    },
    engageProxyRotation: () => { proxyRotator?.engage(); },
    start: async () => {
      resetMcpStatus();
      await supervisor.start();
    },
    stop: async () => {
      proxyRotator?.stop();
      await supervisor.stop();
      await opencode2api?.stop();
    },
  };
}
