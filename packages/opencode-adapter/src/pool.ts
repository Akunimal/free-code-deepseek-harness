import { spawn, ChildProcess } from 'node:child_process';
import { createServer, Server } from 'node:net';
import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolConfig, Socks5Config, WorkerHandle, WorkerStatus } from './types.js';

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
export const DEFAULT_POOL_SIZE = 6;

export function normalizePoolSize(value: number): number {
  if (!Number.isFinite(value)) return POOL_MIN_SIZE;
  return Math.max(POOL_MIN_SIZE, Math.min(POOL_MAX_SIZE, Math.trunc(value)));
}

interface ManagedWorker extends WorkerHandle {
  proc: ChildProcess | null;
  generation: number;
  healthFails: number;
  lastRestartAt: number;
  stopped: boolean;
  respawnTimer: NodeJS.Timeout | null;
  /** Wall-clock ms at which pickHealthy may consider this worker again.
   *  Set by parkWorker after a 5xx/connect fail; the worker keeps status
   *  'ready' (still handles direct restartWorker calls) but is skipped
   *  from LB round-robin selection until this deadline passes. */
  parkedUntil: number;
}

type PoolInitConfig = Omit<PoolConfig, 'size'> & { size?: number };

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

async function healthOk(port: number, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // /healthz is the shipped sidecar's liveness route. A 503 still means the
    // listener is serving while its model catalog warms, so any HTTP response
    // establishes worker readiness.
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: ctrl.signal,
    });
    return res.status > 0;
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
      spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, shell: false });
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

/** Wait for the child itself to close; a fixed sleep can overlap a respawn. */
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

export class OpenCodePool implements Pool {
  private cfg: PoolConfig;
  private workerMap = new Map<string, ManagedWorker>();
  private rrIndex = 0;
  private started = false;
  private healthTimer: NodeJS.Timeout | null = null;
  private spawnPromises = new Map<string, Promise<void>>();
  private generations = new Map<string, number>();
  private changeListeners = new Set<(w: WorkerHandle) => void>();
  private stuckListeners = new Set<(w: WorkerHandle) => void>();

  constructor(config: PoolInitConfig) {
    this.cfg = {
      ...config,
      size: normalizePoolSize(config.size ?? DEFAULT_POOL_SIZE),
    };
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

    this.healthTimer = setInterval(() => {
      void this.healthTick().catch((err) => console.error('[pool] healthTick error:', err));
    }, HEALTH_INTERVAL_MS);
    this.healthTimer.unref();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    const workers = [...this.workerMap.values()];
    for (const w of workers) {
      w.stopped = true;
      w.generation = this.nextGeneration(w.id);
      if (w.respawnTimer) {
        clearTimeout(w.respawnTimer);
        w.respawnTimer = null;
      }
      w.status = 'stopped';
      this.emitChange(w);
    }
    await Promise.all(workers.map(async (w) => {
      const proc = w.proc;
      if (w.pid > 0) killTree(w.pid);
      if (proc && proc.exitCode === null) await waitForExit(proc);
    }));
    // A port reservation or health probe may still be in flight. It is safe to
    // await those promises now that `started` and every worker generation have
    // been invalidated; their callbacks can no longer install replacements.
    await Promise.allSettled([...this.spawnPromises.values()]);
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
      worker.generation = this.nextGeneration(worker.id);
      if (worker.respawnTimer) {
        clearTimeout(worker.respawnTimer);
        worker.respawnTimer = null;
      }
      worker.status = 'stopped';
      this.emitChange(worker);
      if (worker.pid > 0) killTree(worker.pid);
    }
    await Promise.all(removals.map(async (worker) => {
      if (worker.proc && worker.proc.exitCode === null) await waitForExit(worker.proc);
    }));
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

  pickHealthy(skip?: ReadonlySet<string>): WorkerHandle | null {
    const now = Date.now();
    const ready = [...this.workerMap.values()].filter((w) => {
      if (w.status !== 'ready') return false;
      if (skip && skip.has(w.id)) return false;
      if (w.parkedUntil > now) return false;
      return true;
    });
    if (ready.length === 0) return null;
    // Rotate through the eligible subset. Keeping a single rrIndex across
    // skip variants means we do not fixate on the first eligible worker
    // when skip changes size between requests.
    const w = ready[this.rrIndex % ready.length];
    this.rrIndex++;
    return toPublic(w!);
  }

  parkWorker(id: string, ms: number): void {
    const w = this.workerMap.get(id);
    if (!w || ms <= 0) return;
    const until = Date.now() + ms;
    if (until > w.parkedUntil) w.parkedUntil = until;
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
    const pending = this.spawnPromises.get(id);
    if (pending !== undefined) return pending;
    const run = this.spawnWorkerOnce(id, attempt);
    this.spawnPromises.set(id, run);
    try {
      await run;
    } finally {
      if (this.spawnPromises.get(id) === run) this.spawnPromises.delete(id);
    }
  }

  private nextGeneration(id: string): number {
    const next = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, next);
    return next;
  }

  private async spawnWorkerOnce(id: string, _attempt = 0): Promise<void> {
    if (!this.started) return;
    const existing = this.workerMap.get(id);
    // The exit handler marks a dead worker unhealthy before scheduling a
    // respawn. Use that state as the source of truth: Node exposes a signaled
    // POSIX child with platform-dependent exitCode/signalCode combinations.
    if (existing && existing.proc && !existing.stopped && existing.status !== 'unhealthy' && existing.status !== 'stopped') return;

    const generation = this.nextGeneration(id);

    const port = await getFreePort();
    // stop()/resize() may have invalidated this generation while the port was
    // being reserved. Never install a late handle or spawn after lifecycle
    // ownership has been revoked.
    if (!this.started || this.generations.get(id) !== generation) return;
    const wd = join(this.cfg.workDir, id);
    mkdirSync(wd, { recursive: true });
    const logFile = join(this.cfg.logDir, `${id}.log`);

    const configPath = this.writeWorkerConfig(wd, port);

    const handle: ManagedWorker = {
      id,
      pid: -1,
      port,
      status: 'starting',
      startedAt: Date.now(),
      restarts: existing ? existing.restarts + 1 : 0,
      proc: null,
      generation,
      healthFails: 0,
      lastRestartAt: Date.now(),
      stopped: false,
      respawnTimer: null,
      parkedUntil: 0,
    };
    this.workerMap.set(id, handle);
    this.emitChange(handle);

    const args = ['-config', configPath, '-listen', `127.0.0.1:${port}`];
    if (process.env.OPENCODE2API_EXTRA_ARGS) {
      args.push(...process.env.OPENCODE2API_EXTRA_ARGS.split(/\s+/).filter(Boolean));
    }

    let proc: ChildProcess;
    let logFd: number | undefined;
    try {
      logFd = openSync(logFile, 'a');
      proc = spawn(this.cfg.binaryPath, args, {
        cwd: wd,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', logFd, logFd],
      });
    } catch (err) {
      handle.status = 'stopped';
      handle.stopped = true;
      this.emitChange(handle);
      console.error(`[pool] spawn ${id} failed:`, err);
      return;
    } finally {
      if (logFd !== undefined) closeSync(logFd);
    }

    handle.proc = proc;
    handle.pid = proc.pid ?? -1;
    proc.on('exit', (code, signal) => {
      if (handle.stopped || this.workerMap.get(id) !== handle || handle.generation !== generation) return; // deliberate or stale generation
      console.warn(`[pool] ${id} exited code=${code} signal=${signal}`);
      handle.status = 'unhealthy';
      this.emitChange(handle);
      void this.maybeRespawn(id, handle, generation);
    });

    // Wait for readiness: /healthz answers within 15s.
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.started || handle.stopped || proc.exitCode !== null) return;
      if (await healthOk(port, HEALTH_POLL_MS + 100)) {
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

  private async maybeRespawn(id: string, handle: ManagedWorker, generation: number): Promise<void> {
    if (!this.started || handle.stopped || this.workerMap.get(id) !== handle || handle.generation !== generation) return;
    if (handle.respawnTimer !== null) return;

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
    handle.respawnTimer = setTimeout(() => {
      handle.respawnTimer = null;
      if (!this.started || handle.stopped || this.workerMap.get(id) !== handle || handle.generation !== generation) return;
      void this.spawnWorker(id, handle.restarts);
    }, delay);
    handle.respawnTimer.unref();
  }

  private async killAndRespawn(w: ManagedWorker): Promise<void> {
    w.stopped = true;
    w.generation = this.nextGeneration(w.id);
    if (w.respawnTimer) {
      clearTimeout(w.respawnTimer);
      w.respawnTimer = null;
    }
    w.status = 'stopped';
    this.emitChange(w);
    killTree(w.pid);
    if (w.proc && w.proc.exitCode === null) await waitForExit(w.proc);
    w.stopped = false;
    if (this.started) await this.spawnWorker(w.id);
  }

  private async healthTick(): Promise<void> {
    if (!this.started) return;
    // Snapshot the worker map to avoid race conditions with resize/spawn during async iteration.
    const snapshot = [...this.workerMap.values()];
    for (const w of snapshot) {
      if (w.status !== 'ready' && w.status !== 'unhealthy') continue;
      const ok = await healthOk(w.port, 2_000);
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

  async setSocks5(config: Socks5Config | null): Promise<void> {
    if (config) {
      this.cfg.socks5 = config;
    } else {
      delete this.cfg.socks5;
    }

    const pushes: Promise<void>[] = [];
    for (const w of this.workerMap.values()) {
      if (w.status !== 'ready' || w.port <= 0) continue;
      pushes.push(this.pushSocks5ToWorker(w));
    }
    await Promise.allSettled(pushes);
  }

  private async pushSocks5ToWorker(w: ManagedWorker): Promise<void> {
    const body = this.cfg.socks5
      ? {
          socks5_proxies: this.cfg.socks5.socks5_proxies,
          active_socks5: this.cfg.socks5.active_socks5,
          socks5_paid_direct: this.cfg.socks5.socks5_paid_direct,
        }
      : { socks5_proxies: [], active_socks5: '', socks5_paid_direct: false };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    try {
      await fetch(`http://127.0.0.1:${w.port}/api/config`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.cfg.baseAuthHeader ? { Authorization: this.cfg.baseAuthHeader } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch {
      console.warn(`[pool] failed to push socks5 config to ${w.id}`);
    } finally {
      clearTimeout(t);
    }
  }

  private writeWorkerConfig(workerDir: string, port: number): string {
    const cfgPath = join(workerDir, 'config.json');
    const authHeader = this.cfg.baseAuthHeader?.trim() || 'Bearer public';
    const serverKey = authHeader.replace(/^Bearer\s+/i, '').trim() || 'public';
    const config: Record<string, unknown> = {
      listen: `127.0.0.1:${port}`,
      server_keys: [serverKey],
      zen_keys: [],
      go_keys: [],
      anonymous: true,
      prefer: 'zen',
      proxies: ['direct'],
      proxyfile: '',
      upstream: {
        zen: 'https://opencode.ai/zen',
        go: 'https://opencode.ai/zen/go',
      },
      retry: { max_attempts: 3, timeout_seconds: 300 },
      models: { refresh_seconds: 300, protocols: {} },
      performance: {
        max_idle_conns: 2048,
        max_idle_conns_per_host: 256,
        max_conns_per_host: 0,
        idle_conn_timeout_seconds: 120,
        connect_timeout_seconds: 5,
        failure_cooldown_seconds: 15,
        attempt_timeout_seconds: 0,
      },
      logging: { level: 'info', ring_size: 2000, dump_request_bodies: false },
      webui: { enabled: false, listen: '127.0.0.1:0', username: 'local', session_ttl_minutes: 720 },
      ...(this.cfg.socks5 ?? {}),
    };
    writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
    return cfgPath;
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
