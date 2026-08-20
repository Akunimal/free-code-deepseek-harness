import { spawn, ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer, createConnection, Server } from 'node:net';

export interface TorInstance {
  index: number;
  socksPort: number;
  controlPort: number;
  pid: number;
  status: 'starting' | 'ready' | 'stopped';
}

export interface TorFleetConfig {
  torBinaryPath: string;
  dataDir: string;
  geoipDir: string;
  instanceCount?: number;
}

interface ManagedTor {
  index: number;
  socksPort: number;
  controlPort: number;
  pid: number;
  status: 'starting' | 'ready' | 'stopped';
  proc: ChildProcess | null;
}

const DEFAULT_INSTANCE_COUNT = 4;
const SOCKS_BASE_PORT = 9150;
const CONTROL_BASE_PORT = 9251;
const BOOTSTRAP_TIMEOUT_MS = 60_000;
const BOOTSTRAP_POLL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv: Server = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(true));
    });
  });
}

export class TorFleet {
  private cfg: TorFleetConfig;
  private instances = new Map<number, ManagedTor>();
  private running = false;
  private changeListeners = new Set<(instances: TorInstance[]) => void>();

  constructor(config: TorFleetConfig) {
    this.cfg = config;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const count = this.cfg.instanceCount ?? DEFAULT_INSTANCE_COUNT;
    mkdirSync(this.cfg.dataDir, { recursive: true });

    const spawns: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      spawns.push(this.spawnInstance(i));
    }
    await Promise.allSettled(spawns);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const inst of this.instances.values()) {
      inst.status = 'stopped';
      if (inst.proc && inst.proc.exitCode === null) {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/T', '/F', '/PID', String(inst.pid)], { windowsHide: true });
          } else {
            inst.proc.kill('SIGTERM');
          }
        } catch { /* best effort */ }
      }
    }
    await sleep(1_000);
    for (const inst of this.instances.values()) {
      if (inst.proc && inst.proc.exitCode === null) {
        try { inst.proc.kill('SIGKILL'); } catch { /* */ }
      }
    }
    this.instances.clear();
    this.emitChange();
  }

  isRunning(): boolean {
    return this.running;
  }

  status(): TorInstance[] {
    return [...this.instances.values()].map(toPublic);
  }

  socksProxies(): Array<{ name: string; addr: string }> {
    return [...this.instances.values()]
      .filter((i) => i.status === 'ready')
      .map((i) => ({ name: `tor-${i.index}`, addr: `127.0.0.1:${i.socksPort}` }));
  }

  onChange(cb: (instances: TorInstance[]) => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  private async spawnInstance(index: number): Promise<void> {
    if (!this.running) return;

    const socksPort = SOCKS_BASE_PORT + index;
    const controlPort = CONTROL_BASE_PORT + index;

    const portsFree = await isPortFree(socksPort) && await isPortFree(controlPort);
    if (!portsFree) {
      console.warn(`[torfleet] ports ${socksPort}/${controlPort} busy, skipping tor-${index}`);
      return;
    }

    const instanceDir = join(this.cfg.dataDir, `tor-${index}`);
    mkdirSync(instanceDir, { recursive: true });

    const torrcPath = join(instanceDir, 'torrc');
    const logPath = join(instanceDir, 'tor.log');
    const torrc = [
      `SocksPort 127.0.0.1:${socksPort}`,
      `ControlPort 127.0.0.1:${controlPort}`,
      `DataDirectory ${instanceDir.replace(/\\/g, '/')}`,
      `GeoIPFile ${join(this.cfg.geoipDir, 'geoip').replace(/\\/g, '/')}`,
      `GeoIPv6File ${join(this.cfg.geoipDir, 'geoip6').replace(/\\/g, '/')}`,
      `Log notice file ${logPath.replace(/\\/g, '/')}`,
      'CookieAuthentication 0',
      'HashedControlPassword ""',
    ].join('\n');
    writeFileSync(torrcPath, torrc, 'utf8');

    const handle: ManagedTor = {
      index,
      socksPort,
      controlPort,
      pid: -1,
      status: 'starting',
      proc: null,
    };
    this.instances.set(index, handle);
    this.emitChange();

    let proc: ChildProcess;
    try {
      proc = spawn(this.cfg.torBinaryPath, ['-f', torrcPath], {
        cwd: instanceDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      console.error(`[torfleet] spawn tor-${index} failed:`, err);
      handle.status = 'stopped';
      this.emitChange();
      return;
    }

    handle.proc = proc;
    handle.pid = proc.pid ?? -1;
    proc.stdout?.on('data', () => { /* consumed */ });
    proc.stderr?.on('data', () => { /* consumed */ });

    proc.on('exit', (code, signal) => {
      if (!this.running) return;
      console.warn(`[torfleet] tor-${index} exited code=${code} signal=${signal}`);
      handle.status = 'stopped';
      this.emitChange();
    });

    const ready = await this.waitForBootstrap(index, socksPort, logPath);
    if (ready) {
      handle.status = 'ready';
      console.log(`[torfleet] tor-${index} ready on SOCKS5 127.0.0.1:${socksPort}`);
    } else {
      console.warn(`[torfleet] tor-${index} failed to bootstrap`);
      handle.status = 'stopped';
      if (proc.exitCode === null) {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/T', '/F', '/PID', String(handle.pid)], { windowsHide: true });
          } else {
            proc.kill('SIGTERM');
          }
        } catch { /* */ }
      }
    }
    this.emitChange();
  }

  private async waitForBootstrap(index: number, socksPort: number, logPath: string): Promise<boolean> {
    const deadline = Date.now() + BOOTSTRAP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.running) return false;
      const inst = this.instances.get(index);
      if (!inst || (inst.proc && inst.proc.exitCode !== null)) return false;

      try {
        if (existsSync(logPath)) {
          const log = readFileSync(logPath, 'utf8');
          if (log.includes('Bootstrapped 100%')) return true;
        }
      } catch { /* */ }

      try {
        const ok = await this.checkSocks(socksPort);
        if (ok) return true;
      } catch { /* */ }

      await sleep(BOOTSTRAP_POLL_MS);
    }
    return false;
  }

  private checkSocks(port: number): Promise<boolean> {
    return new Promise((res) => {
      const client = createConnection({ host: '127.0.0.1', port }, () => {
        client.destroy();
        res(true);
      });
      client.on('error', () => res(false));
      client.setTimeout(2_000, () => { client.destroy(); res(false); });
    });
  }

  private emitChange(): void {
    const snapshot = this.status();
    for (const cb of this.changeListeners) cb(snapshot);
  }
}

function toPublic(m: ManagedTor): TorInstance {
  return {
    index: m.index,
    socksPort: m.socksPort,
    controlPort: m.controlPort,
    pid: m.pid,
    status: m.status,
  };
}

export interface TorFleetState {
  enabled: boolean;
}

const STATE_FILE = 'torfleet-state.json';

export function loadTorFleetState(userDataDir: string): TorFleetState {
  const p = join(userDataDir, STATE_FILE);
  try {
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, 'utf8'));
      return { enabled: !!data.enabled };
    }
  } catch { /* */ }
  return { enabled: false };
}

export function saveTorFleetState(userDataDir: string, state: TorFleetState): void {
  writeFileSync(join(userDataDir, STATE_FILE), JSON.stringify(state), 'utf8');
}

export function resolveTorBinaryPath(resourcesDir: string): string {
  const candidates = [
    resolve(resourcesDir, 'tor', 'tor.exe'),
    resolve(resourcesDir, 'tor', 'tor'),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

export function resolveTorGeoipDir(resourcesDir: string): string {
  return resolve(resourcesDir, 'tor', 'data');
}
