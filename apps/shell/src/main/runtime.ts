import { HarnessSupervisor, HarnessInstance } from './harness-supervisor.js';
import { SecretStore, resolveSecrets } from './secret-store.js';
import { join, resolve } from 'node:path';
import { retireRemovedRuntime } from './retired-runtime.js';
import { startPhoenixGateway, type PhoenixGatewayInstance } from './phoenix-gateway.js';
import { embeddedMcpEnvironment, ensureEmbeddedMcpConfig } from './mcp-home.js';
import type { EmbeddedMcpState, McpRuntimeStatus, WorkerHandle } from '@freecode/shared-types';

/**
 * Shell runtime — owns the full backend stack of the desktop app:
 *   packaged Phoenix/FreeLLMpool gateway -> dsh web supervisor.
 */

export interface ShellRuntimeConfig {
  /** Static resources dir containing the packaged Phoenix gateway and OCR. */
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
}

export type McpStatusListener = (status: McpRuntimeStatus) => void;

export interface ShellRuntime {
  /** Hash-verified Phoenix/FreeLLMpool gateway owned by this shell process. */
  phoenix: PhoenixGatewayInstance;
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
  // Phoenix is a required part of this product build. A missing or invalid
  // payload is a startup error; never start DSH with a stale gateway URL.
  const phoenix = await startPhoenixGateway({
    resourcesDir: cfg.resourcesDir,
    userDataDir: cfg.userDataDir,
    log,
  });
  const gatewayEnv = {
    ...cfg.extraEnv,
    ...mcpEnv,
    ...extraEnv,
    FREECODE_PHOENIX_API_KEY: phoenix.apiKey,
  };

  const supervisor = new HarnessSupervisor({
    nodePath: cfg.nodePath,
    cliEntry,
    homeDir: join(cfg.userDataDir, 'dsh-home'),
    // Product-managed MCP values are authoritative for the child process:
    // they are derived from the persisted catalog, not inherited from the
    // Electron environment. A new harness process reads the current toggles.
    extraEnv: gatewayEnv,
    browserBridge: cfg.browserBridge,
    nodeEnv: cfg.nodeEnv,
    log,
    onMcpStatus: emitMcpStatus,
  });

  return {
    phoenix,
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
      supervisor.updateExtraEnv({ ...cfg.extraEnv, ...mcpEnv, ...extraEnv, FREECODE_PHOENIX_API_KEY: phoenix.apiKey });
      return mcpState();
    },
    resetMcpStatus,
    onMcpStatus: (listener) => {
      mcpListeners.add(listener);
      return () => mcpListeners.delete(listener);
    },
    start: async () => {
      resetMcpStatus();
      await supervisor.start();
    },
    stop: async () => {
      await supervisor.stop();
      await phoenix.stop();
    },
  };
}
