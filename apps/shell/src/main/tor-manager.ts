import { launchHidden, killProcessTree } from './freecode-launcher.js';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer, Socket } from 'node:net';

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
    if (this.state === 'ready' || this.state === 'starting') {
      return this.getStatus();
    }

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

      const torDataDir = join(this.cfg.dataDir, 'tor-single');
      mkdirSync(torDataDir, { recursive: true });

      const geoipFile = join(this.cfg.geoipDir, 'geoip').replace(/\\/g, '/');
      const geoip6File = join(this.cfg.geoipDir, 'geoip6').replace(/\\/g, '/');
      const logPath = join(torDataDir, 'tor.log').replace(/\\/g, '/');
      const torrcPath = join(torDataDir, 'torrc');

      // Optimización de nodos y velocidad para API Proxying (Habr / Linux.do guidelines)
      const torrc = [
        `SocksPort 127.0.0.1:${this.socksPort} IsolateSOCKSAuth`,
        `ControlPort 127.0.0.1:${this.controlPort}`,
        `DataDirectory ${torDataDir.replace(/\\/g, '/')}`,
        ...(existsSync(join(this.cfg.geoipDir, 'geoip')) ? [`GeoIPFile ${geoipFile}`] : []),
        ...(existsSync(join(this.cfg.geoipDir, 'geoip6')) ? [`GeoIPv6File ${geoip6File}`] : []),
        `Log notice file ${logPath}`,
        'CookieAuthentication 0',
        'HashedControlPassword ""',
        'ClientOnly 1',
        'FastFirstHopPK 1',
        'CircuitBuildTimeout 5',
        'LearnCircuitBuildTimeout 0',
        'NumEntryGuards 3',
        'MaxCircuitDirtiness 30',
        'ExitNodes {ch},{de},{nl},{se},{fr},{at},{is}',
        'StrictNodes 0',
        'ExcludeExitNodes {cn},{ru},{ir},{sy},{kp}',
      ].join('\n');

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
        this.cfg.log?.('warn', `tor daemon exited code=${code} signal=${signal}`);
        this.proc = null;
        this.pid = -1;
        if (this.state !== 'stopped') {
          this.state = 'failed';
          this.lastError = `tor daemon exited code=${code}`;
          this.emitChange();
        }
      });

      const ready = await this.waitForBootstrap(BOOTSTRAP_TIMEOUT_MS);
      if (ready) {
        this.state = 'ready';
        this.cfg.log?.('info', 'Tor Single-Instance ready', { socksPort: this.socksPort, controlPort: this.controlPort, pid: this.pid });
      } else {
        this.state = 'failed';
        this.lastError = 'Tor bootstrap timed out';
        this.cfg.log?.('warn', this.lastError);
        await this.stop();
      }
    } catch (err) {
      this.state = 'failed';
      this.lastError = (err as Error).message;
      this.cfg.log?.('error', 'Tor startup failed', { error: this.lastError });
    }

    this.emitChange();
    return this.getStatus();
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
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
      const ok = await new Promise<boolean>((res) => {
        const client = new Socket();
        let authed = false;
        client.setTimeout(5_000);
        client.connect(this.controlPort, '127.0.0.1', () => {
          client.write('AUTHENTICATE ""\r\n');
        });
        client.on('data', (data) => {
          const str = data.toString();
          if (str.startsWith('250 OK') && !authed) {
            authed = true;
            client.write('SIGNAL NEWNYM\r\n');
          } else if (str.startsWith('250 OK') && authed) {
            client.destroy();
            res(true);
          } else if (str.startsWith('510') || str.startsWith('515') || str.startsWith('552')) {
            client.destroy();
            res(false);
          }
        });
        client.on('error', () => { client.destroy(); res(false); });
        client.on('timeout', () => { client.destroy(); res(false); });
      });

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

  private async waitForBootstrap(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.proc || this.proc.exitCode !== null) return false;
      const free = await isPortFree(this.socksPort);
      if (!free) return true; // Port bound means Tor SOCKS is up
      await sleep(BOOTSTRAP_POLL_MS);
    }
    return false;
  }
}
