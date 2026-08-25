import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Harness supervisor — owns the `dsh web` child process.
 *
 * The real CLI entry (`vendor/deepseek-harness/apps/cli/lib/bin.js`) is run
 * with the bundled Node runtime:
 *   node <cli-entry> web --port 0 --host 127.0.0.1 --no-open
 * `--port 0` lets the OS pick a free port; the web bundle prints the readonly
 * line `dsh web: http://127.0.0.1:<PORT>` once the Loader tree settles, which
 * is the readiness signal this supervisor grabs.
 */

export interface HarnessSupervisorConfig {
  /** Absolute path to the Node binary (bundled runtime). */
  nodePath: string;
  /** Absolute path to the dsh CLI entry (lib/bin.js). */
  cliEntry: string;
  /** Directory for DSH_HOME (profiles, logs, sessions). */
  homeDir: string;
  /** Port the load balancer is listening on (injected as OPENCODE2API_LB_URL). */
  lbUrl: string | null;
  /** Extra env passed through to the child. */
  extraEnv?: Record<string, string>;
  /** Optional visible embedded Chromium bridge exposed to computer_use. */
  browserBridge?: { endpoint: string; token: string };
  /** Runtime-specific env (for example ELECTRON_RUN_AS_NODE=1). */
  nodeEnv?: Record<string, string>;
  /** Respawn backoff base (ms). Default 1000. */
  backoffBaseMs?: number;
  /** Max respawns per 60s window. Default 5. */
  restartBudget?: number;
  /** Structured logger piped to app.log by the shell. */
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
}

export interface HarnessInstance {
  url: string; // http://127.0.0.1:<port>
  pid: number;
  startedAt: number;
  restarts: number;
  /** When set (stuck event), the last output tail captured before giving up.
   *  UI code should surface this so the user sees WHY dsh failed, instead
   *  of the opaque "supervisor gave up after 5 restarts". */
  lastOutputTail?: string;
}

export type HarnessStatus = 'stopped' | 'starting' | 'ready' | 'unhealthy';

const READY_RE = /(?:dsh web: )?(?:ready on )?(http:\/\/127\.0\.0\.1:\d+)/;
// A cold Windows profile boot can materialize hundreds of workspace modules
// before the web server prints its URL. Thirty seconds caused the supervisor
// to kill a healthy first boot, then hide the real startup latency behind
// repeated respawns. Keep the timeout bounded, but allow one cold boot.
const READY_TIMEOUT_MS = 90_000;
const RESTART_WINDOW_MS = 60_000;
const STOP_GRACE_MS = 5_000;
const BACKOFF_MAX_MS = 30_000;

/** The Electron shell owns the UI; the child web runtime must never open a browser. */
export const DSH_WEB_ARGS = [
  'web',
  '--port',
  '0',
  '--host',
  '127.0.0.1',
  '--no-open',
] as const;

/**
 * Electron GUI processes do not own a durable console stream. On Windows the
 * stream can close while the child is still flushing data; writing to that
 * pipe then raises an unhandled `write EOF` in the main process. The
 * structured app logger remains the authoritative diagnostic sink.
 */
function writeConsoleDiagnostic(stream: NodeJS.WriteStream, text: string): void {
  if (!stream.isTTY || stream.destroyed || !stream.writable) return;
  try {
    stream.write(text);
  } catch {
    // Console diagnostics are best effort and must never crash the shell.
  }
}

export class HarnessSupervisor {
  private cfg: HarnessSupervisorConfig;
  private proc: ChildProcess | null = null;
  private status: HarnessStatus = 'stopped';
  private url: string | null = null;
  private restarts = 0;
  private lastRestartAt = 0;
  private startedAt = 0;
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private readyListeners = new Set<(h: HarnessInstance) => void>();
  private stuckListeners = new Set<(h: HarnessInstance) => void>();
  private outBuffer = '';

  constructor(config: HarnessSupervisorConfig) {
    this.cfg = { ...config, backoffBaseMs: config.backoffBaseMs ?? 1_000 };
  }

  get statusValue(): HarnessStatus {
    return this.status;
  }

  get currentUrl(): string | null {
    return this.url;
  }

  async start(): Promise<void> {
    if (this.proc && this.proc.exitCode === null) return;
    this.stopping = false;
    if (this.status === 'starting') return;
    await this.spawn();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const proc = this.proc;
    this.proc = null;
    this.status = 'stopped';
    this.url = null;
    if (proc && proc.exitCode === null) {
      killTree(proc.pid ?? -1);
      // Give the tree a moment to die; tests assert no orphan pids.
      await sleep(1_500);
    }
  }

  async restart(): Promise<void> {
    this.stopping = false;
    if (this.proc && this.proc.exitCode === null) {
      const old = this.proc;
      this.proc = null;
      killTree(old.pid ?? -1);
      await sleep(300);
    }
    await this.spawn();
  }

  onReady(cb: (h: HarnessInstance) => void): () => void {
    this.readyListeners.add(cb);
    return () => this.readyListeners.delete(cb);
  }

  onStuck(cb: (h: HarnessInstance) => void): () => void {
    this.stuckListeners.add(cb);
    return () => this.stuckListeners.delete(cb);
  }

  // ---- internals ----

  private async spawn(): Promise<void> {
    if (this.stopping) return;

    this.status = 'starting';
    this.url = null;
    this.outBuffer = '';
    mkdirSync(this.cfg.homeDir, { recursive: true });
    this.startedAt = Date.now();

    const dshArgs = [...DSH_WEB_ARGS];
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...this.cfg.nodeEnv,
      DSH_HOME: this.cfg.homeDir,
      ...(this.cfg.lbUrl ? { OPENCODE2API_LB_URL: this.cfg.lbUrl } : {}),
      ...(this.cfg.browserBridge ? {
        FREECODE_EMBEDDED_BROWSER_ENDPOINT: this.cfg.browserBridge.endpoint,
        FREECODE_EMBEDDED_BROWSER_TOKEN: this.cfg.browserBridge.token,
      } : {}),
      ...this.cfg.extraEnv,
    };

    console.log(`[supervisor] spawn ${this.cfg.nodePath} ${this.cfg.cliEntry} ${dshArgs.join(' ')}`);
    let proc: ChildProcess;
    try {
      proc = spawn(this.cfg.nodePath, [this.cfg.cliEntry, ...dshArgs], {
        env,
        cwd: this.cfg.homeDir,
        windowsHide: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      console.error('[supervisor] spawn failed:', err);
      this.status = 'unhealthy';
      return;
    }
    this.proc = proc;

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      writeConsoleDiagnostic(process.stdout, `[dsh] ${text}`);
      this.cfg.log?.('debug', text.trimEnd());
      this.outBuffer += text;
      if (this.outBuffer.length > 65_536) this.outBuffer = this.outBuffer.slice(-32_768);
      this.tryGrabs();
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      writeConsoleDiagnostic(process.stderr, `[dsh:err] ${text}`);
      this.cfg.log?.('warn', `dsh stderr: ${text.trimEnd()}`);
      this.outBuffer += text;
      if (this.outBuffer.length > 65_536) this.outBuffer = this.outBuffer.slice(-32_768);
      this.tryGrabs();
    });

    proc.on('exit', (code, signal) => {
      if (this.stopping) return; // deliberate
      console.warn(`[supervisor] dsh exited code=${code} signal=${signal}`);
      this.cfg.log?.('error', 'dsh exited', { code, signal, tail: this.outBuffer.slice(-4000) });
      if (this.status === 'ready') {
        this.status = 'unhealthy';
      } else {
        this.status = 'stopped';
      }
      this.url = null;
      void this.maybeRespawn();
    });

    // Readiness deadline: if no `dsh web: http://...` line within 30s, kill and respawn.
    setTimeout(() => {
      if (this.proc === proc && this.status === 'starting' && proc.exitCode === null) {
        console.error('[supervisor] dsh did not report readiness in 30s, killing');
        this.cfg.log?.('error', 'dsh readiness timeout', { tail: this.outBuffer.slice(-4000) });
        killTree(proc.pid ?? -1); // exit handler respawns
      }
    }, READY_TIMEOUT_MS).unref();
  }

  private tryGrabs(): void {
    if (this.status !== 'starting') return;
    const m = this.outBuffer.match(READY_RE);
    if (!m) return;
    const url = m[1]!;
    this.url = url;
    this.status = 'ready';
    const inst: HarnessInstance = {
      url,
      pid: this.proc?.pid ?? -1,
      startedAt: this.startedAt,
      restarts: this.restarts,
    };
    console.log(`[supervisor] READY ${url}`);
    for (const cb of this.readyListeners) cb(inst);
  }

  private async maybeRespawn(): Promise<void> {
    if (this.stopping) return;
    const now = Date.now();
    if (now - this.lastRestartAt >= RESTART_WINDOW_MS) {
      this.restarts = 0;
    }
    this.lastRestartAt = now;
    if (this.restarts >= (this.cfg.restartBudget ?? 5)) {
      const tail = this.outBuffer.slice(-4000);
      console.error('[supervisor] restart budget exceeded, giving up');
      this.cfg.log?.('error', 'harness supervisor gave up', { restarts: this.restarts, tail });
      for (const cb of this.stuckListeners) {
        cb({ url: this.url ?? '', pid: -1, startedAt: this.startedAt, restarts: this.restarts, lastOutputTail: tail });
      }
      return;
    }
    this.restarts++;
    const base = this.cfg.backoffBaseMs ?? 1_000;
    const delay = Math.min(base * 2 ** (this.restarts - 1), BACKOFF_MAX_MS);
    console.warn(`[supervisor] respawn in ${delay}ms (attempt ${this.restarts})`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.spawn();
    }, delay);
    this.restartTimer.unref();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true });
    } else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already dead */
      }
      setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* already dead */
        }
      }, STOP_GRACE_MS).unref();
    }
  } catch {
    /* best effort */
  }
}
