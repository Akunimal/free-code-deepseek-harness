import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveGeminiWeb2ApiDir } from './resource-paths.js';
import {
  DEFAULT_GEMINI_WEB2API_PORT,
  GEMINI_WEB_FALLBACK_MODELS,
  GEMINI_WEB_PROVIDER,
} from './local-provider-config.js';

export { DEFAULT_GEMINI_WEB2API_PORT, GEMINI_WEB_FALLBACK_MODELS, GEMINI_WEB_PROVIDER } from './local-provider-config.js';

export type GeminiWeb2ApiStatus = 'stopped' | 'starting' | 'ready' | 'unavailable';

export interface GeminiWeb2ApiSupervisorConfig {
  resourcesDir: string;
  userDataDir: string;
  port?: number;
  pythonPath?: string;
  startupTimeoutMs?: number;
  healthTimeoutMs?: number;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}

export interface GeminiWeb2ApiStartResult {
  available: boolean;
  managed: boolean;
  baseUrl: string;
  reason?: string;
}

interface PythonCommand {
  executable: string;
  args: string[];
}

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 500;
const POLL_INTERVAL_MS = 200;

/**
 * Owns the optional Python process without making it a hard dependency of
 * FreeCode. The app can still use its normal provider when Python is absent;
 * the Gemini route simply remains unavailable until the user installs Python
 * or runs gemini-web2api separately on the configured port.
 */
export class GeminiWeb2ApiSupervisor {
  private readonly cfg: Required<Pick<GeminiWeb2ApiSupervisorConfig, 'resourcesDir' | 'userDataDir'>>
    & GeminiWeb2ApiSupervisorConfig;
  private proc: ChildProcess | null = null;
  private status: GeminiWeb2ApiStatus = 'stopped';
  private managed = false;
  private stopping = false;
  private reason: string | undefined;

  constructor(config: GeminiWeb2ApiSupervisorConfig) {
    this.cfg = { ...config };
  }

  get statusValue(): GeminiWeb2ApiStatus {
    return this.status;
  }

  get isManaged(): boolean {
    return this.managed;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port()}`;
  }

  get lastReason(): string | undefined {
    return this.reason;
  }

  async start(): Promise<GeminiWeb2ApiStartResult> {
    if (this.status === 'ready') return this.result();

    this.stopping = false;
    this.reason = undefined;

    // Reuse a service the user already launched. This also makes development
    // convenient: the app does not compete with a separately managed server.
    if (await this.isHealthy()) {
      this.status = 'ready';
      this.managed = false;
      return this.result();
    }

    const sourceDir = resolveGeminiWeb2ApiDir(this.cfg.resourcesDir);
    if (!existsSync(resolve(sourceDir, 'gemini_web2api', '__main__.py'))) {
      return this.unavailable('gemini-web2api source is not present in the packaged resources');
    }

    const python = resolvePythonCommand(this.cfg.pythonPath);
    if (!python) {
      return this.unavailable('Python 3 was not found; install Python or run gemini-web2api separately');
    }

    const dataDir = join(this.cfg.userDataDir, 'gemini-web2api');
    let configPath: string;
    try {
      configPath = ensureConfig(dataDir, this.port());
    } catch (error) {
      return this.unavailable('gemini-web2api config.json is invalid; fix or remove it', error);
    }
    this.status = 'starting';
    this.managed = true;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    };
    const args = [
      ...python.args,
      '-m',
      'gemini_web2api',
      '--config',
      configPath,
    ];
    let proc: ChildProcess;
    try {
      proc = spawn(python.executable, args, {
        cwd: sourceDir,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      return this.unavailable('could not start Python for gemini-web2api', error);
    }
    this.proc = proc;
    this.attachOutput(proc);
    proc.once('error', (error) => {
      this.cfg.log?.('warn', 'gemini-web2api process error', { error: String(error) });
    });
    proc.once('exit', (code, signal) => {
      if (this.stopping) return;
      this.cfg.log?.('warn', 'gemini-web2api exited', { code, signal });
      this.proc = null;
      this.managed = false;
      this.status = 'unavailable';
      this.reason = `gemini-web2api exited before or during use (code=${String(code)}, signal=${String(signal)})`;
    });

    const ready = await this.waitForHealth(this.cfg.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS);
    if (!ready) {
      const reason = 'gemini-web2api did not become ready before the startup timeout';
      this.cfg.log?.('warn', reason);
      await this.stop();
      return this.unavailable(reason);
    }
    this.status = 'ready';
    return this.result();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const proc = this.proc;
    this.proc = null;
    this.managed = false;
    this.status = 'stopped';
    if (proc && proc.exitCode === null) {
      killTree(proc.pid ?? -1);
      await sleep(250);
    }
  }

  private result(): GeminiWeb2ApiStartResult {
    return {
      available: this.status === 'ready',
      managed: this.managed,
      baseUrl: this.baseUrl,
      ...(this.reason ? { reason: this.reason } : {}),
    };
  }

  private unavailable(reason: string, error?: unknown): GeminiWeb2ApiStartResult {
    this.status = 'unavailable';
    this.managed = false;
    this.reason = reason;
    this.cfg.log?.('warn', reason, error ? { error: String(error) } : undefined);
    return this.result();
  }

  private async waitForHealth(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() < deadline) {
      if (await this.isHealthy()) return true;
      if (this.proc && this.proc.exitCode !== null) return false;
      await sleep(POLL_INTERVAL_MS);
    }
    return this.isHealthy();
  }

  private async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        signal: AbortSignal.timeout(this.cfg.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { status?: unknown };
      return body.status === 'ok';
    } catch {
      return false;
    }
  }

  private attachOutput(proc: ChildProcess): void {
    proc.stdout?.on('data', (chunk: Buffer) => {
      this.cfg.log?.('info', `gemini-web2api: ${chunk.toString().trimEnd()}`);
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      this.cfg.log?.('debug', `gemini-web2api stderr: ${chunk.toString().trimEnd()}`);
    });
  }

  private port(): number {
    const configured = this.cfg.port ?? DEFAULT_GEMINI_WEB2API_PORT;
    return Number.isInteger(configured) && configured > 0 && configured <= 65_535
      ? configured
      : DEFAULT_GEMINI_WEB2API_PORT;
  }
}

export function resolvePythonCommand(explicit?: string): PythonCommand | null {
  const candidates: PythonCommand[] = explicit
    ? [{ executable: explicit, args: [] }]
    : process.platform === 'win32'
      ? [
        { executable: 'python', args: [] },
        { executable: 'python3', args: [] },
        { executable: 'py', args: ['-3'] },
      ]
      : [
        { executable: 'python3', args: [] },
        { executable: 'python', args: [] },
      ];

  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate.executable, [...candidate.args, '--version'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (result.status === 0) return candidate;
    } catch {
      // Try the next interpreter candidate.
    }
  }
  return null;
}

export function ensureConfig(dataDir: string, port: number): string {
  mkdirSync(dataDir, { recursive: true });
  const configPath = join(dataDir, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({
      port,
      host: '127.0.0.1',
      api_keys: [],
      log_requests: true,
    }, null, 2) + '\n', 'utf8');
  } else {
    // Validate JSON early so a malformed user edit is reported in the app log
    // instead of looking like a generic Python startup failure.
    JSON.parse(readFileSync(configPath, 'utf8'));
  }
  return configPath;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
      setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already stopped.
        }
      }, 5_000).unref();
    }
  } catch {
    // Best effort during app shutdown.
  }
}
