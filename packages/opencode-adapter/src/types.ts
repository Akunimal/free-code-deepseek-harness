/**
 * Contracts for the opencode2api worker pool.
 * Schema per PLAN FASE 3 (packages/opencode-adapter).
 */

export type WorkerStatus = 'starting' | 'ready' | 'unhealthy' | 'stopped';

export interface WorkerHandle {
  id: string; // 'w0'..'wN'
  pid: number;
  port: number; // assigned by us from a free port (SO-assigned at reservation time)
  status: WorkerStatus;
  startedAt: number;
  restarts: number;
}

export interface Socks5ProxyEntry {
  name: string;
  addr: string;
}

export interface Socks5Config {
  socks5_proxies: Socks5ProxyEntry[];
  active_socks5: string;
  socks5_paid_direct: boolean;
}

export interface PoolConfig {
  size: number; // default 6, min 1, max 16
  binaryPath: string;
  workDir: string; // per-worker isolated dir under userData
  baseAuthHeader?: string; // 'Bearer public' by default -> free-only
  logDir: string;
  socks5?: Socks5Config;
  /** Called on any worker status transition (overlay + logging). */
  onWorkerChange?: (w: WorkerHandle) => void;
  /** Called when a worker exhausted its restart budget (native notification hook). */
  onWorkerStuck?: (w: WorkerHandle) => void;
}

export interface Pool {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Current worker-slot count selected by the worker slider. */
  size(): number;
  /** Change the worker-slot count live; values are clamped to 1..16. */
  resize(size: number): Promise<void>;
  workers(): WorkerHandle[];
  /** Round-robin over healthy/ready workers. Returns null if none. */
  pickHealthy(): WorkerHandle | null;
  onWorkerChange(cb: (w: WorkerHandle) => void): () => void;
  /** Force-restart a single worker by id (Settings overlay button). */
  restartWorker(id: string): Promise<void>;
  /** Update SOCKS5 proxy config on all running workers via admin API. */
  setSocks5(config: Socks5Config | null): Promise<void>;
}
