import {
  createLoadBalancer,
  DEFAULT_POOL_SIZE,
  LoadBalancer,
  OpenCodePool,
  Pool,
  WorkerHandle,
} from '@freecode/opencode-adapter';
import { HarnessSupervisor, HarnessInstance } from './harness-supervisor.js';
import { SecretStore, resolveSecrets } from './secret-store.js';
import { join, resolve } from 'node:path';
import { resolveOpencodeBinary } from './resource-paths.js';

/**
 * Shell runtime — owns the full backend stack of the desktop app:
 *   opencode-adapter pool (N workers) -> LoadBalancer -> dsh web supervisor.
 *
 * The LB is the single entry point the renderer talks to; the harness gets
 * OPENCODE2API_LB_URL injected so its /api calls land on the pool.
 */

export interface ShellRuntimeConfig {
  /** Resources dir containing the opencode2api binaries + dsh CLI. */
  resourcesDir: string;
  /** Node binary used to run the dsh CLI. */
  nodePath: string;
  /** User data dir (DSH_HOME + worker logs). */
  userDataDir: string;
  poolSize?: number;
  lbAuthHeader?: string;
  /** Secret vault; apiKeyEnv refs are resolved into spawn env (not process.env). */
  secrets?: SecretStore;
  /** Env var names to resolve from the vault into the harness child env. */
  secretEnvNames?: string[];
  /** Runtime env needed by a packaged Electron child process. */
  nodeEnv?: Record<string, string>;
  /** Optional logging callback forwarded to the supervisor. */
  log?: (level: string, msg: string, meta?: Record<string, unknown>) => void;
}

export interface ShellRuntime {
  pool: Pool;
  lb: LoadBalancer;
  supervisor: HarnessSupervisor;
  workers: () => WorkerHandle[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createShellRuntime(cfg: ShellRuntimeConfig): Promise<ShellRuntime> {
  const binaryPath = resolveOpencodeBinary(cfg.resourcesDir, process.platform, process.arch);

  const pool = new OpenCodePool({
    size: cfg.poolSize ?? DEFAULT_POOL_SIZE,
    binaryPath,
    workDir: join(cfg.userDataDir, 'workers'),
    logDir: join(cfg.userDataDir, 'logs'),
  });

  const lb = createLoadBalancer({
    pool,
    authHeader: cfg.lbAuthHeader,
    logError: (msg, err) => console.error(`[lb] ${msg}`, err ?? ''),
  });
  await lb.listen();

  const cliEntry = resolve(join(cfg.resourcesDir, 'dsh', 'apps', 'cli', 'lib', 'bin.js'));
  const secretEnvNames = cfg.secretEnvNames ?? ['FREECODE_PUBLIC_KEY'];
  const extraEnv: Record<string, string> = {};
  if (cfg.secrets) {
    for (const [k, v] of Object.entries(
      await resolveSecrets(cfg.secrets, secretEnvNames),
    )) {
      extraEnv[k] = v;
    }
  }
  const supervisor = new HarnessSupervisor({
    nodePath: cfg.nodePath,
    cliEntry,
    homeDir: join(cfg.userDataDir, 'dsh-home'),
    lbUrl: lb.url(),
    extraEnv,
    nodeEnv: cfg.nodeEnv,
  });

  return {
    pool,
    lb,
    supervisor,
    workers: () => pool.workers(),
    start: async () => {
      await pool.start();
      await supervisor.start();
    },
    stop: async () => {
      await supervisor.stop();
      await lb.close();
      await pool.stop();
    },
  };
}
