import { launchHidden, killProcessTree } from './freecode-launcher.js';
import { buildTorrcContent } from './tor-config.js';
import { getTorBootstrapProgress, signalTorNewnym } from './tor-control.js';
import type { ChildProcess } from 'node:child_process';
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export interface TorManagerConfig {
  torBinaryPath: string;
  dataDir: string;
  geoipDir: string;
  socksPort?: number;
  controlPort?: number;
  bootstrapTimeoutMs?: number;
  bootstrapPollMs?: number;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
}

export interface TorManagerStatus {
  active: boolean;
  status: 'stopped' | 'starting' | 'ready' | 'rotating' | 'failed';
  socksPort: number;
  controlPort: number;
  pid: number;
  circuitCount: number;
  lastRotatedAt: number | null;
  lastError: string | null;
}

const DEFAULT_SOCKS_PORT = 9050;
const DEFAULT_CONTROL_PORT = 9051;
const BOOTSTRAP_TIMEOUT_MS = 120_000;
const BOOTSTRAP_POLL_MS = 500;
const MAX_TOR_DIAGNOSTIC_CHARS = 1_536;
const MAX_TOR_OUTPUT_CAPTURE_CHARS = 4_096;

function sanitizeTorDiagnostic(value: string): string {
  return value
    .replace(/\b(cookie|password|token|secret|authorization)\b\s*([:=])\s*(?:"[^"]*"|'[^']*'|\S+)/giu, '$1$2[redacted]')
    .replace(/\b[a-f\d]{64,}\b/giu, '[redacted]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(-MAX_TOR_DIAGNOSTIC_CHARS);
}

function appendTorOutput(current: string, chunk: unknown): string {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  return `${current}${text}`.slice(-MAX_TOR_OUTPUT_CAPTURE_CHARS);
}

function readTorLogTail(filePath: string): string {
  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'r');
    const size = fstatSync(fd).size;
    const length = Math.min(size, MAX_TOR_OUTPUT_CAPTURE_CHARS);
    if (length === 0) return '';
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(fd, buffer, 0, length, Math.max(0, size - length));
    return buffer.subarray(0, bytesRead).toString('utf8');
  } catch {
    // The daemon may fail before creating its file log; stdout/stderr remain a fallback.
    return '';
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* best effort */ }
    }
  }
}

function collectTorDiagnostics(outputTail: string, logPath: string): string {
  const torLog = readTorLogTail(logPath);
  return [
    outputTail ? `child output: ${outputTail}` : '',
    torLog ? `tor.log: ${torLog}` : '',
  ].filter(Boolean).join('\n');
}

function formatTorFailure(reason: string, output: string): string {
  const diagnostic = sanitizeTorDiagnostic(output);
  const combined = diagnostic ? `${reason}: ${diagnostic}` : reason;
  return combined.slice(0, 2_048);
}

export interface TorBootstrapWaitOptions {
  isProcessAlive: () => boolean;
  isSocksReady: () => Promise<boolean>;
  readBootstrapProgress: () => Promise<number | null>;
  timeoutMs: number;
  pollMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitForTorBootstrap(options: TorBootstrapWaitOptions): Promise<boolean> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (!options.isProcessAlive()) return false;
    try {
      if (await options.isSocksReady() && await options.readBootstrapProgress() === 100) return true;
    } catch {
      // Tor may not have created its cookie/control endpoint yet; retry until
      // bootstrap completes, the process exits, or the bounded deadline expires.
    }
    await sleep(Math.min(options.pollMs, Math.max(0, deadline - Date.now())));
  }
  return false;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}

export async function findFreePort(preferred: number, used: Set<number> = new Set()): Promise<number> {
  let port = preferred;
  while (port <= 65000) {
    if (!used.has(port) && (await isPortFree(port))) {
      used.add(port);
      return port;
    }
    port += 1;
  }
  throw new Error(`no free port from ${preferred}`);
}

/**
 * Single-Instance Tor Manager — manages a single lightweight tor.exe daemon
 * tuned for high-speed API egress proxying via Fast Exit Nodes ({ch},{de},{nl}, etc.)
 * and SOCKS5 stream isolation (IsolateSOCKSAuth).
 */
export class TorManager {
  private cfg: TorManagerConfig;
  private proc: ChildProcess | null = null;
  private pid = -1;
  private socksPort = DEFAULT_SOCKS_PORT;
  private controlPort = DEFAULT_CONTROL_PORT;
  private portsInitialized = false;
  private controlCookiePath = '';
  private lifecycleGeneration = 0;
  private stopPromise: Promise<void> | null = null;
  private state: TorManagerStatus['status'] = 'stopped';
  private lastRotatedAt: number | null = null;
  private lastError: string | null = null;
  private changeListeners = new Set<(status: TorManagerStatus) => void>();

  constructor(config: TorManagerConfig) {
    this.cfg = config;
  }

  get socksUrl(): string {
    return `socks5://127.0.0.1:${this.socksPort}`;
  }

  /** Stable local failover candidate, available after the manager chooses safe ports. */
  get proxyUrl(): string | null {
    return this.portsInitialized ? this.socksUrl : null;
  }

  get isReady(): boolean {
    return this.state === 'ready' || this.state === 'rotating';
  }

  async start(): Promise<TorManagerStatus> {
    while (this.stopPromise) await this.stopPromise;
    if (this.state === 'ready' || this.state === 'starting') {
      return this.getStatus();
    }

    const generation = ++this.lifecycleGeneration;

    if (!existsSync(this.cfg.torBinaryPath)) {
      this.state = 'failed';
      this.lastError = `tor.exe binary missing at ${this.cfg.torBinaryPath}`;
      this.cfg.log?.('warn', this.lastError);
      this.emitChange();
      return this.getStatus();
    }

    this.state = 'starting';
    this.lastError = null;
    this.emitChange();

    try {
      if (!this.portsInitialized) {
        const used = new Set<number>();
        this.socksPort = await findFreePort(this.cfg.socksPort ?? DEFAULT_SOCKS_PORT, used);
        this.controlPort = await findFreePort(this.cfg.controlPort ?? DEFAULT_CONTROL_PORT, used);
        this.portsInitialized = true;
      } else {
        // opencode2api keeps this SOCKS URL for the life of the shell. Never
        // silently select a new port on retry; that would leave its proxy pool
        // pointing at the old endpoint (or a different local service).
        if (!(await isPortFree(this.socksPort))) {
          throw new Error(`Tor SOCKS port ${this.socksPort} is already in use; refusing to retarget`);
        }
        if (!(await isPortFree(this.controlPort))) {
          throw new Error(`Tor control port ${this.controlPort} is already in use; refusing to retarget`);
        }
      }
      if (generation !== this.lifecycleGeneration) return this.getStatus();

      const torDataDir = join(this.cfg.dataDir, 'tor-single');
      mkdirSync(torDataDir, { recursive: true });
      this.controlCookiePath = join(torDataDir, 'control_auth_cookie');

      const geoipFile = join(this.cfg.geoipDir, 'geoip').replace(/\\/g, '/');
      const geoip6File = join(this.cfg.geoipDir, 'geoip6').replace(/\\/g, '/');
      const logPath = join(torDataDir, 'tor.log').replace(/\\/g, '/');
      const torrcPath = join(torDataDir, 'torrc');

      // Tor writes startup failures to its configured file logger rather than
      // the child pipes. Remove stale contents so a retry reports only its run.
      writeFileSync(logPath, '', 'utf8');

      // Optimización de nodos y velocidad para API Proxying (Habr / Linux.do guidelines)
      const torrc = buildTorrcContent({
        socksPort: this.socksPort,
        controlPort: this.controlPort,
        dataDirectory: torDataDir,
        controlCookiePath: this.controlCookiePath,
        logPath,
        ...(existsSync(join(this.cfg.geoipDir, 'geoip')) ? { geoipFile } : {}),
        ...(existsSync(join(this.cfg.geoipDir, 'geoip6')) ? { geoip6File } : {}),
      });

      writeFileSync(torrcPath, torrc, 'utf8');

      const { proc: launched } = launchHidden({
        executable: this.cfg.torBinaryPath,
        args: ['-f', torrcPath],
        cwd: torDataDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        requestId: 'tor-single-daemon',
        closeReason: 'tor-exit',
      });

      this.proc = launched;
      this.pid = launched.pid ?? -1;

      let outputTail = '';
      let exitFailure: string | null = null;
      let spawnFailure: string | null = null;
      launched.stdout?.on('data', (chunk: Buffer) => { outputTail = appendTorOutput(outputTail, chunk); });
      launched.stderr?.on('data', (chunk: Buffer) => { outputTail = appendTorOutput(outputTail, chunk); });
      launched.once('error', (error) => {
        spawnFailure = formatTorFailure(`Tor daemon failed to spawn: ${error.message}`, collectTorDiagnostics(outputTail, logPath));
        if (generation !== this.lifecycleGeneration) return;
        this.cfg.log?.('error', 'Tor daemon failed to spawn', { error: spawnFailure });
        this.proc = null;
        this.pid = -1;
        this.state = 'failed';
        this.lastError = spawnFailure;
        this.emitChange();
      });
      launched.once('exit', (code, signal) => {
        exitFailure = formatTorFailure(
          `Tor daemon exited (code=${code ?? 'unknown'}${signal ? ` signal=${signal}` : ''})`,
          collectTorDiagnostics(outputTail, logPath),
        );
        if (generation !== this.lifecycleGeneration) return;
        this.cfg.log?.('warn', 'Tor daemon exited', { error: exitFailure });
        this.proc = null;
        this.pid = -1;
        if (this.state !== 'stopped') {
          this.state = 'failed';
          this.lastError = exitFailure;
          this.emitChange();
        }
      });

      // Tor is an optional failover leg. Return to application bootstrap as
      // soon as the child is spawned; direct routing stays available while
      // readiness is monitored in the background.
      void this.completeStartup(generation, launched, () => outputTail, () => spawnFailure, () => exitFailure, logPath)
        .catch(async (err: unknown) => {
          if (generation !== this.lifecycleGeneration) return;
          const failure = formatTorFailure((err as Error).message, collectTorDiagnostics(outputTail, logPath));
          if (this.proc === launched && launched.exitCode === null) {
            const generationBeforeCleanup = this.lifecycleGeneration;
            await this.stop();
            if (this.lifecycleGeneration !== generationBeforeCleanup + 1 || this.state !== 'stopped') return;
          }
          this.state = 'failed';
          this.lastError = failure;
          this.cfg.log?.('error', 'Tor startup monitor failed', { error: failure });
          this.emitChange();
        });
    } catch (err) {
      if (generation !== this.lifecycleGeneration) return this.getStatus();
      const failure = formatTorFailure((err as Error).message, '');
      if (this.proc && this.proc.exitCode === null) await this.stop();
      this.state = 'failed';
      this.lastError = failure;
      this.cfg.log?.('error', 'Tor startup failed', { error: failure });
    }

    this.emitChange();
    return this.getStatus();
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.lifecycleGeneration += 1;
    this.state = 'stopped';
    const stopping = this.stopOwnedProcess();
    this.stopPromise = stopping;
    try {
      await stopping;
    } finally {
      if (this.stopPromise === stopping) this.stopPromise = null;
    }
  }

  private async stopOwnedProcess(): Promise<void> {
    if (this.proc && this.proc.exitCode === null) {
      try {
        if (process.platform === 'win32' && this.pid > 0) {
          killProcessTree(this.pid);
        } else {
          this.proc.kill('SIGTERM');
        }
      } catch { /* best effort */ }
      await sleep(500);
      if (this.proc && this.proc.exitCode === null) {
        try { this.proc.kill('SIGKILL'); } catch { /* best effort */ }
      }
    }
    this.proc = null;
    this.pid = -1;
    this.emitChange();
  }

  /**
   * Request a fresh Exit Node identity by sending SIGNAL NEWNYM over ControlPort.
   */
  async rotateIdentity(): Promise<boolean> {
    if (!this.isReady) return false;
    const prevState = this.state;
    this.state = 'rotating';
    this.emitChange();

    try {
      const ok = await signalTorNewnym(this.controlPort, this.controlCookiePath);

      if (ok) {
        this.lastRotatedAt = Date.now();
        this.cfg.log?.('info', 'Tor identity rotated via SIGNAL NEWNYM');
      }
      this.state = prevState === 'stopped' ? 'stopped' : 'ready';
      this.emitChange();
      return ok;
    } catch {
      this.state = prevState === 'stopped' ? 'stopped' : 'ready';
      this.emitChange();
      return false;
    }
  }

  getStatus(): TorManagerStatus {
    return {
      active: this.isReady,
      status: this.state,
      socksPort: this.socksPort,
      controlPort: this.controlPort,
      pid: this.pid,
      circuitCount: this.isReady ? 1 : 0,
      lastRotatedAt: this.lastRotatedAt,
      lastError: this.lastError,
    };
  }

  onChange(cb: (status: TorManagerStatus) => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  private emitChange(): void {
    const current = this.getStatus();
    for (const listener of this.changeListeners) {
      try { listener(current); } catch { /* subscriber error */ }
    }
  }

  private async waitForBootstrap(timeoutMs: number, proc: ChildProcess): Promise<boolean> {
    return waitForTorBootstrap({
      isProcessAlive: () => this.proc === proc && proc.exitCode === null,
      isSocksReady: async () => !(await isPortFree(this.socksPort)),
      readBootstrapProgress: () => getTorBootstrapProgress(this.controlPort, this.controlCookiePath),
      timeoutMs,
      pollMs: this.cfg.bootstrapPollMs ?? BOOTSTRAP_POLL_MS,
    });
  }

  private async completeStartup(
    generation: number,
    proc: ChildProcess,
    getOutputTail: () => string,
    getSpawnFailure: () => string | null,
    getExitFailure: () => string | null,
    logPath: string,
  ): Promise<void> {
    const ready = await this.waitForBootstrap(this.cfg.bootstrapTimeoutMs ?? BOOTSTRAP_TIMEOUT_MS, proc);
    if (generation !== this.lifecycleGeneration) return;
    if (ready) {
      this.state = 'ready';
      this.cfg.log?.('info', 'Tor Single-Instance ready', { socksPort: this.socksPort, controlPort: this.controlPort, pid: this.pid });
      this.emitChange();
      return;
    }

    const failure = getSpawnFailure() ?? getExitFailure() ?? formatTorFailure(
      'Tor bootstrap timed out',
      collectTorDiagnostics(getOutputTail(), logPath),
    );
    if (this.proc === proc && proc.exitCode === null) {
      const generationBeforeCleanup = this.lifecycleGeneration;
      await this.stop();
      // A user stop/restart that raced timeout cleanup owns the final state.
      if (this.lifecycleGeneration !== generationBeforeCleanup + 1 || this.state !== 'stopped') return;
    }
    this.state = 'failed';
    this.lastError = failure;
    this.cfg.log?.('warn', 'Tor startup did not reach bootstrap readiness', { error: failure });
    this.emitChange();
  }
}
