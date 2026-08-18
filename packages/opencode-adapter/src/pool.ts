import { spawn, ChildProcess } from 'node:child_process';
import { createServer, Server } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolConfig, WorkerHandle, WorkerStatus } from './types.js';

const HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_POLL_MS = 250;
const HEALTH_INTERVAL_MS = 5_000;
const UNHEALTHY_THRESHOLD = 3;
const RESTART_BUDGET = 5; // respawns per 60s window
const RESTART_WINDOW_MS = 60_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const STOP_GRACE_MS = 5_000;
export const POOL_MIN_SIZE = 1;
export const POOL_MAX_SIZE = 16;

export function normalizePoolSize(value: number): number {
  if (!Number.isFinite(value)) return POOL_MIN_SIZE;
  return Math.max(POOL_MIN_SIZE, Math.min(POOL_MAX_SIZE, Math.trunc(value)));
}

interface ManagedWorker extends WorkerHandle {
  proc: ChildProcess | null;
  healthFails: number;
  lastRestartAt: number;
  stopped: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Reserve a free TCP port on loopback, release it, and hand the number back.
 *  The worker is spawned immediately after, so the TOCTOU window is minimal;
 *  a race is surfaced by the health check and healed by the respawn loop. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv: Server = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close();
        reject(new Error('getFreePort: no numeric address'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

async function healthOk(port: number, timeoutMs: number, authHeader?: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: ctrl.signal,
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_MAX_MS);
}

/** Kill a process tree. On Windows taskkill /T /F (opencode2api can spawn
 *  helper children); on POSIX SIGTERM then SIGKILL after grace. */
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

export class OpenCodePool implements Pool {
  private cfg: PoolConfig;
  private workerMap = new Map<string, ManagedWorker>();
  private rrIndex = 0;
  private started = false;
  private healthTimer: NodeJS.Timeout | null = null;
  private changeListeners = new Set<(w: WorkerHandle) => void>();
  private stuckListeners = new Set<(w: WorkerHandle) => void>();

  constructor(config: PoolConfig) {
    this.cfg = { ...config, size: normalizePoolSize(config.size) };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    mkdirSync(this.cfg.logDir, { recursive: true });
    mkdirSync(this.cfg.workDir, { recursive: true });

    const spawns: Promise<void>[] = [];
    for (let i = 0; i < this.cfg.size; i++) {
      spawns.push(this.spawnWorker(`w${i}`));
    }
    await Promise.allSettled(spawns);

    this.healthTimer = setInterval(() => void this.healthTick(), HEALTH_INTERVAL_MS);
    this.healthTimer.unref();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    const pids = [...this.workerMap.values()].map((w) => w.pid);
    for (const w of this.workerMap.values()) {
      w.stopped = true;
      w.status = 'stopped';
      this.emitChange(w);
    }
    for (const pid of pids) killTree(pid);
    // Wait briefly for the tree to die so tests can assert no orphan pids.
    await sleep(1_500);
    for (const w of this.workerMap.values()) {
      if (w.proc && w.proc.exitCode === null) {
        try {
          w.proc.kill('SIGKILL');
        } catch {
          /* already dead */
        }
      }
    }
    this.workerMap.clear();
  }

  size(): number {
    return this.cfg.size;
  }

  async resize(size: number): Promise<void> {
    const next = normalizePoolSize(size);
    const previous = this.cfg.size;
    this.cfg.size = next;
    if (!this.started || next === previous) return;

    if (next > previous) {
      const spawns: Promise<void>[] = [];
      for (let i = previous; i < next; i++) {
        spawns.push(this.spawnWorker(`w${i}`));
      }
      await Promise.allSettled(spawns);
      return;
    }

    const removals = [...this.workerMap.values()].filter((worker) => {
      const index = Number(worker.id.slice(1));
      return Number.isInteger(index) && index >= next;
    });
    for (const worker of removals) {
      worker.stopped = true;
      worker.status = 'stopped';
      this.emitChange(worker);
      if (worker.pid > 0) killTree(worker.pid);
    }
    await sleep(300);
    for (const worker of removals) {
      if (worker.proc && worker.proc.exitCode === null) {
        try {
          worker.proc.kill('SIGKILL');
        } catch {
          /* already dead */
        }
      }
      this.workerMap.delete(worker.id);
    }
  }

  workers(): WorkerHandle[] {
    return [...this.workerMap.values()].map(toPublic);
  }

  pickHealthy(): WorkerHandle | null {
    const ready = [...this.workerMap.values()].filter((w) => w.status === 'ready');
    if (ready.length === 0) return null;
    const w = ready[this.rrIndex % ready.length];
    this.rrIndex++;
    return toPublic(w!);
  }

  onWorkerChange(cb: (w: WorkerHandle) => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  onWorkerStuck(cb: (w: WorkerHandle) => void): () => void {
    this.stuckListeners.add(cb);
    return () => this.stuckListeners.delete(cb);
  }

  async restartWorker(id: string): Promise<void> {
    const w = this.workerMap.get(id);
    if (!w) throw new Error(`no worker ${id}`);
    await this.killAndRespawn(w);
  }

  // ---- internals ----

  private async spawnWorker(id: string, attempt = 0): Promise<void> {
    if (!this.started) return;
    const existing = this.workerMap.get(id);
    if (existing && existing.proc && existing.proc.exitCode === null) return;

    const port = await getFreePort();
    const logFile = join(this.cfg.logDir, `${id}.log`);
    const wd = join(this.cfg.workDir, id);
    mkdirSync(wd, { recursive: true });

    const handle: ManagedWorker = {
      id,
      pid: -1,
      port,
      status: 'starting',
      startedAt: Date.now(),
      restarts: existing ? existing.restarts + 1 : 0,
      proc: null,
      healthFails: 0,
      lastRestartAt: Date.now(),
      stopped: false,
    };
    this.workerMap.set(id, handle);
    this.emitChange(handle);

    const args = [
      '-host', '127.0.0.1',
      '-port', String(port),
      '-password', '',
      '-log-file', logFile,
      '-config', join(wd, 'config.json'),
    ];
    if (process.env.OPENCODE2API_EXTRA_ARGS) {
      args.push(...process.env.OPENCODE2API_EXTRA_ARGS.split(/\s+/).filter(Boolean));
    }

    let proc: ChildProcess;
    try {
      proc = spawn(this.cfg.binaryPath, args, {
        cwd: wd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      handle.status = 'stopped';
      handle.stopped = true;
      this.emitChange(handle);
      console.error(`[pool] spawn ${id} failed:`, err);
      return;
    }

    handle.proc = proc;
    handle.pid = proc.pid ?? -1;
    proc.stdout?.on('data', () => {
      /* consumed; logs go to log-file anyway */
    });
    proc.stderr?.on('data', () => {
      /* consumed */
    });

    proc.on('exit', (code, signal) => {
      if (handle.stopped) return; // deliberate stop
      console.warn(`[pool] ${id} exited code=${code} signal=${signal}`);
      handle.status = 'unhealthy';
      this.emitChange(handle);
      void this.maybeRespawn(id, handle);
    });

    // Wait for readiness: /health 200 within 15s.
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.started || handle.stopped || proc.exitCode !== null) return;
      if (await healthOk(port, HEALTH_POLL_MS + 100, this.cfg.baseAuthHeader)) {
        handle.status = 'ready';
        handle.healthFails = 0;
        this.emitChange(handle);
        console.log(`[pool] ${id} ready on 127.0.0.1:${port} (pid ${handle.pid})`);
        return;
      }
      await sleep(HEALTH_POLL_MS);
    }
    // Never became healthy: kill and let the exit handler respawn.
    console.warn(`[pool] ${id} did not become healthy in ${HEALTH_TIMEOUT_MS}ms`);
    killTree(handle.pid);
  }

  private async maybeRespawn(id: string, handle: ManagedWorker): Promise<void> {
    if (!this.started || handle.stopped) return;

    const now = Date.now();
    if (now - handle.lastRestartAt < RESTART_WINDOW_MS) {
      // Count respawns inside the 60s window.
      if (handle.restarts >= RESTART_BUDGET) {
        console.error(`[pool] ${id} exceeded restart budget, giving up`);
        handle.status = 'unhealthy';
        this.emitChange(handle);
        for (const cb of this.stuckListeners) cb(toPublic(handle));
        return;
      }
    } else {
      handle.restarts = 0; // window expired, reset budget
    }
    handle.lastRestartAt = now;

    const delay = backoffMs(handle.restarts);
    console.warn(`[pool] respawning ${id} in ${delay}ms (attempt ${handle.restarts + 1})`);
    await sleep(delay);
    if (!this.started || handle.stopped) return;
    await this.spawnWorker(id, handle.restarts);
  }

  private async killAndRespawn(w: ManagedWorker): Promise<void> {
    w.stopped = true;
    w.status = 'stopped';
    this.emitChange(w);
    killTree(w.pid);
    await sleep(300);
    w.stopped = false;
    await this.spawnWorker(w.id);
  }

  private async healthTick(): Promise<void> {
    if (!this.started) return;
    for (const w of this.workerMap.values()) {
      if (w.status !== 'ready' && w.status !== 'unhealthy') continue;
      const ok = await healthOk(w.port, 2_000, this.cfg.baseAuthHeader);
      if (ok) {
        w.healthFails = 0;
        if (w.status === 'unhealthy' && w.proc?.exitCode === null) {
          w.status = 'ready';
          this.emitChange(w);
        }
      } else {
        w.healthFails++;
        if (w.healthFails >= UNHEALTHY_THRESHOLD && w.status === 'ready') {
          console.warn(`[pool] ${w.id} unhealthy after ${UNHEALTHY_THRESHOLD} fails, killing`);
          w.status = 'unhealthy';
          this.emitChange(w);
          killTree(w.pid); // exit handler will respawn
        }
      }
    }
  }

  private emitChange(w: ManagedWorker): void {
    const pub = toPublic(w);
    this.cfg.onWorkerChange?.(pub);
    for (const cb of this.changeListeners) cb(pub);
  }
}

function toPublic(w: ManagedWorker): WorkerHandle {
  return {
    id: w.id,
    pid: w.pid,
    port: w.port,
    status: w.status,
    startedAt: w.startedAt,
    restarts: w.restarts,
  };
}
