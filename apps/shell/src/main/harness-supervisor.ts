import { launchHidden, killProcessTree, type LaunchMetrics } from './freecode-launcher.js'
import type { ChildProcess } from 'node:child_process'
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { McpRuntimeStatus } from '@freecode/shared-types';

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
  /** Receives live MCP readiness/failure evidence parsed from dsh output. */
  onMcpStatus?: (status: McpRuntimeStatus) => void;
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

// dsh web prints a one-shot launch URL with a process token. Preserve the
// query string: the embedded WebContentsView must exchange that token for
// its authenticated session cookie before loading the clean root page.
const READY_RE = /(?:dsh web: )?(?:ready on )?(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s)]+)/;
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
 * Every process owned by the desktop shell is a background implementation
 * detail. Keep this policy in one exported seam so a future spawn refactor
 * cannot accidentally bring back flashing/closing console windows on Win32.
 * `shell: false` also prevents command strings from being routed through
 * cmd.exe, which would create an extra visible console in some environments.
 */
export const HIDDEN_CHILD_PROCESS_OPTIONS = { windowsHide: true, shell: false } as const

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
  private generation = 0;
  private spawnPromise: Promise<void> | null = null;
  private readyListeners = new Set<(h: HarnessInstance) => void>();
  private stuckListeners = new Set<(h: HarnessInstance) => void>();
  private outBuffer = '';
  private mcpLineBuffer = '';
  private lifecycleLock: Promise<void> = Promise.resolve();

  constructor(config: HarnessSupervisorConfig) {
    this.cfg = { ...config, backoffBaseMs: config.backoffBaseMs ?? 1_000 };
  }

  get statusValue(): HarnessStatus {
    return this.status;
  }

  get currentUrl(): string | null {
    return this.url;
  }

  /** Process id for black-box lifecycle/window probes; null while stopped. */
  get currentPid(): number | null {
    return this.proc?.pid ?? null;
  }

  /** Replace child-only environment for the next generation. */
  updateExtraEnv(extraEnv: Record<string, string>): void {
    this.cfg = { ...this.cfg, extraEnv: { ...extraEnv } };
  }

  async start(): Promise<void> {
    if (this.status === 'starting' || (this.proc && this.proc.exitCode === null)) return;
    await this.withLock(async () => {
      if (this.status === 'starting' || (this.proc && this.proc.exitCode === null)) return;
      this.stopping = false;
      await this.spawn();
    });
  }

  async stop(): Promise<void> {
    await this.withLock(async () => {
      this.stopping = true;
      // Invalidate exit/readiness callbacks from the generation being stopped.
      this.generation++;
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
        await waitForExit(proc);
      }
      if (this.spawnPromise) await this.spawnPromise;
    });
  }

  async restart(): Promise<void> {
    await this.withLock(async () => {
      // Treat restart as a stop followed by a new generation. The old exit
      // handler must not be allowed to schedule a second spawn while the
      // explicit restart is starting its replacement.
      this.stopping = true;
      this.generation++;
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }
      if (this.proc && this.proc.exitCode === null) {
        const old = this.proc;
        this.proc = null;
        this.status = 'stopped';
        this.url = null;
        killTree(old.pid ?? -1);
        await waitForExit(old);
      }
      if (this.spawnPromise) await this.spawnPromise;
      this.stopping = false;
      await this.spawn();
    });
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.lifecycleLock;
    let release: () => void;
    this.lifecycleLock = new Promise<void>((r) => { release = r; });
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
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
    if (this.proc && this.proc.exitCode === null) return;
    if (this.spawnPromise) return this.spawnPromise;

    const pending = this.spawnOnce();
    this.spawnPromise = pending;
    try {
      await pending;
    } finally {
      if (this.spawnPromise === pending) this.spawnPromise = null;
    }
  }

  private async spawnOnce(): Promise<void> {
    if (this.stopping || (this.proc && this.proc.exitCode === null)) return;

    const generation = ++this.generation;

    this.status = 'starting';
    this.url = null;
    this.outBuffer = '';
    this.mcpLineBuffer = '';
    mkdirSync(this.cfg.homeDir, { recursive: true });
    this.startedAt = Date.now();

    const dshArgs = [...DSH_WEB_ARGS];
    // Whitelist only safe env vars instead of leaking all of process.env to the child.
    // This prevents Electron/Node internals, API keys, and debug flags from being exposed.
    const SAFE_ENV_KEYS = [
      'PATH', 'HOME', 'USER', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'TMPDIR',
      'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA',
      'APPDATA', 'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)', 'ProgramData',
      'node_options', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE',
      'DSH_HOME', 'OPENCODE2API_LB_URL',
      'FREECODE_EMBEDDED_BROWSER_ENDPOINT', 'FREECODE_EMBEDDED_BROWSER_TOKEN',
      'FREECODE_PUBLIC_KEY', 'DEEPSEEK_API_KEY',
    ] as const;
    const safeEnv: Record<string, string> = {};
    for (const key of SAFE_ENV_KEYS) {
      const val = process.env[key];
      if (val !== undefined) safeEnv[key] = val;
    }
    const env: Record<string, string> = {
      ...safeEnv,
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
      const { proc: launched } = launchHidden({
        executable: this.cfg.nodePath,
        args: [this.cfg.cliEntry, ...dshArgs],
        cwd: this.cfg.homeDir,
        env,
        generation,
        requestId: `dsh-gen-${generation}`,
        closeReason: 'dsh-exit',
        log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => this.cfg.log?.(level, msg, meta),
      });
      proc = launched;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[supervisor] spawn failed:', message);
      this.cfg.log?.('error', 'dsh spawn failed — no child process created', {
        nodePath: this.cfg.nodePath,
        cliEntry: this.cfg.cliEntry,
        error: message,
      });
      this.status = 'unhealthy';
      // Fire stuck listeners so the shell can close the splash and show
      // an actionable error dialog instead of hanging forever.
      const tail = `Spawn failed: ${message}\nnode: ${this.cfg.nodePath}\ncli: ${this.cfg.cliEntry}`;
      for (const cb of this.stuckListeners) {
        cb({ url: '', pid: -1, startedAt: this.startedAt, restarts: this.restarts, lastOutputTail: tail });
      }
      return;
    }
    this.proc = proc;

    proc.stdout?.on('data', (chunk: Buffer) => this.recordOutput(chunk.toString(), 'debug', process.stdout, '[dsh] '));
    proc.stderr?.on('data', (chunk: Buffer) => this.recordOutput(chunk.toString(), 'warn', process.stderr, '[dsh:err] '));

    proc.on('exit', (code, signal) => {
      if (this.stopping || generation !== this.generation || this.proc !== proc) return;
      this.proc = null;
      console.warn(`[supervisor] dsh exited code=${code} signal=${signal}`);
      this.cfg.log?.('error', 'dsh exited', {
        code,
        signal,
        generation,
        tail: this.outBuffer.slice(-4000),
      });
      if (this.status === 'ready') {
        this.status = 'unhealthy';
      } else {
        this.status = 'stopped';
      }
      this.url = null;
      void this.maybeRespawn(generation);
    });

    // Readiness deadline: if no `dsh web: http://...` line within the bounded
    // cold-start window, kill and respawn.
    setTimeout(() => {
      if (this.generation === generation && this.proc === proc && this.status === 'starting' && proc.exitCode === null) {
        console.error(`[supervisor] dsh did not report readiness in ${READY_TIMEOUT_MS}ms, killing`);
        this.cfg.log?.('error', 'dsh readiness timeout', {
          generation,
          tail: this.outBuffer.slice(-4000),
        });
        killTree(proc.pid ?? -1); // exit handler respawns
      }
    }, READY_TIMEOUT_MS).unref();

    // `spawn()` reports an invalid executable/cwd asynchronously through the
    // ChildProcess error event. A try/catch around spawn() cannot catch that
    // path; without this handler Electron sees an unhandled ENOENT and the
    // supervisor never reaches its bounded restart/stuck contract.
    proc.once('error', (error: NodeJS.ErrnoException) => {
      if (this.stopping || generation !== this.generation || this.proc !== proc) return;
      this.proc = null;
      this.url = null;
      this.status = 'unhealthy';
      const code = error.code ?? 'SPAWN_ERROR';
      const message = error.message.slice(0, 1_024);
      console.error(`[supervisor] dsh spawn error ${code}: ${message}`);
      this.cfg.log?.('error', 'dsh spawn error', {
        code,
        message,
        generation,
        tail: this.outBuffer.slice(-4_000),
      });
      void this.maybeRespawn(generation);
    });
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

  /**
   * Keep the child completely pipe-driven. The MCP bridge writes its explicit
   * FreeCode status contract to stderr (Cordis logs are not guaranteed to be
   * attached to the dsh process streams); the legacy human-readable parser is
   * retained for upstream compositions that do expose those lines.
   */
  private recordOutput(
    text: string,
    level: 'debug' | 'warn',
    stream: NodeJS.WriteStream,
    prefix: string,
  ): void {
    writeConsoleDiagnostic(stream, `${prefix}${text}`);
    this.cfg.log?.(level, level === 'warn' ? `dsh stderr: ${text.trimEnd()}` : text.trimEnd());
    this.outBuffer += text;
    if (this.outBuffer.length > 65_536) this.outBuffer = this.outBuffer.slice(-32_768);
    this.mcpLineBuffer += text;
    const lines = this.mcpLineBuffer.split(/\r?\n/);
    this.mcpLineBuffer = lines.pop() ?? '';
    for (const line of lines) this.parseMcpStatus(line);
    this.tryGrabs();
  }

  private parseMcpStatus(line: string): void {
    const hostStatus = line.match(/^freecode-mcp-status (\{.*\})$/)?.[1];
    if (hostStatus !== undefined) {
      try {
        const record = JSON.parse(hostStatus) as {
          serverId?: unknown;
          state?: unknown;
          toolCount?: unknown;
          error?: unknown;
        };
        if (
          typeof record.serverId === 'string'
          && /^[A-Za-z0-9_-]{1,32}$/.test(record.serverId)
          && (record.state === 'ready' || record.state === 'degraded' || record.state === 'failed')
          && typeof record.toolCount === 'number'
          && Number.isInteger(record.toolCount)
          && record.toolCount >= 0
        ) {
          this.cfg.onMcpStatus?.({
            serverId: record.serverId,
            state: record.state,
            toolCount: Math.min(record.toolCount, 10_000),
            ...(typeof record.error === 'string' ? { error: record.error.slice(0, 1_024) } : {}),
          });
        }
      } catch {
        // Ignore malformed status lines; the child remains diagnosable through
        // the bounded supervisor output tail.
      }
      return;
    }
    const server = line.match(/mcp-client\(([A-Za-z0-9_-]{1,32})\)/)?.[1];
    if (server === undefined) return;
    const ready = line.match(/: ready; initialize -> tools\/list -> schema validation -> (\d+) tool\(s\) registered/);
    if (ready !== null) {
      this.cfg.onMcpStatus?.({ serverId: server, state: 'ready', toolCount: Number(ready[1]) });
      return;
    }
    if (/: giving up after /.test(line)) {
      this.cfg.onMcpStatus?.({
        serverId: server,
        state: 'failed',
        toolCount: 0,
        error: line.slice(-1_024),
      });
      return;
    }
    if (/: (?:connection attempt failed|connection failed; retrying|connection lost; reconnecting)/.test(line)) {
      this.cfg.onMcpStatus?.({
        serverId: server,
        state: 'degraded',
        toolCount: 0,
        error: line.slice(-1_024),
      });
    }
  }

  private async maybeRespawn(generation: number): Promise<void> {
    if (this.stopping || generation !== this.generation || this.proc) return;
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
      if (this.stopping || generation !== this.generation || this.proc) return;
      void this.spawn();
    }, delay);
    this.restartTimer.unref();
  }
}

function waitForExit(proc: ChildProcess, timeoutMs = STOP_GRACE_MS): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref();
    proc.once('exit', finish);
    proc.once('close', finish);
  });
}

function killTree(pid: number): void {
  killProcessTree(pid)
}
