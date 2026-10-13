import { launchHidden, killProcessTree } from './freecode-launcher.js';
import { buildTorrcContent } from './tor-config.js';
import { getTorBootstrapProgress, signalTorNewnym } from './tor-control.js';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export interface TorManagerConfig {
  torBinaryPath: string;
  dataDir: string;
  geoipDir: string;
  socksPort?: number;
  controlPort?: number;
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
const BOOTSTRAP_TIMEOUT_MS = 45_000;
const BOOTSTRAP_POLL_MS = 500;

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
      return this.getStatus();
    }

    this.state = 'starting';
    this.lastError = null;
    this.emitChange();

    try {
      const used = new Set<number>();
      this.socksPort = await findFreePort(this.cfg.socksPort ?? DEFAULT_SOCKS_PORT, used);
      this.controlPort = await findFreePort(this.cfg.controlPort ?? DEFAULT_CONTROL_PORT, used);
      if (generation !== this.lifecycleGeneration) return this.getStatus();

      const torDataDir = join(this.cfg.dataDir, 'tor-single');
      mkdirSync(torDataDir, { recursive: true });
      this.controlCookiePath = join(torDataDir, 'control_auth_cookie');

      const geoipFile = join(this.cfg.geoipDir, 'geoip').replace(/\\/g, '/');
      const geoip6File = join(this.cfg.geoipDir, 'geoip6').replace(/\\/g, '/');
      const logPath = join(torDataDir, 'tor.log').replace(/\\/g, '/');
      const torrcPath = join(torDataDir, 'torrc');

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

      launched.stdout?.on('data', () => { /* consumed */ });
      launched.stderr?.on('data', () => { /* consumed */ });
      launched.once('exit', (code, signal) => {
        if (generation !== this.lifecycleGeneration) return;
        this.cfg.log?.('warn', `tor daemon exited code=${code} signal=${signal}`);
        this.proc = null;
        this.pid = -1;
        if (this.state !== 'stopped') {
          this.state = 'failed';
          this.lastError = `tor daemon exited code=${code}`;
          this.emitChange();
        }
      });

      const ready = await this.waitForBootstrap(BOOTSTRAP_TIMEOUT_MS, launched);
      if (generation !== this.lifecycleGeneration) return this.getStatus();
      if (ready) {
        this.state = 'ready';
        this.cfg.log?.('info', 'Tor Single-Instance ready', { socksPort: this.socksPort, controlPort: this.controlPort, pid: this.pid });
      } else {
        const failure = 'Tor bootstrap timed out';
        await this.stop();
        this.state = 'failed';
        this.lastError = failure;
        this.cfg.log?.('warn', failure);
      }
    } catch (err) {
      if (generation !== this.lifecycleGeneration) return this.getStatus();
      const failure = (err as Error).message;
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
      pollMs: BOOTSTRAP_POLL_MS,
    });
  }
}
