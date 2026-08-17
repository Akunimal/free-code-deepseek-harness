import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { Pool, WorkerHandle } from './types.js';

const STICKY_TTL_MS = 30 * 60 * 1_000; // 30 min
const STICKY_HEADER = 'x-dsh-session-id';

interface StickyEntry {
  workerId: string;
  lastSeen: number;
}

export interface LoadBalancer {
  /** Ready once `listen()` resolves. */
  server: Server;
  port(): number;
  url(): string; // http://127.0.0.1:<port>
  listen(): Promise<void>;
  close(): Promise<void>;
}

export interface LoadBalancerOptions {
  pool: Pool;
  /** Optional outbound auth header forwarded to workers (e.g. 'Bearer public'). */
  authHeader?: string;
  logError?: (msg: string, err?: unknown) => void;
}

export function createLoadBalancer(opts: LoadBalancerOptions): LoadBalancer {
  const { pool, authHeader } = opts;
  const sticky = new Map<string, StickyEntry>();
  const logError =
    opts.logError ?? ((msg: string, err?: unknown) => console.error(`[lb] ${msg}`, err ?? ''));
  let lbPort = 0;

  function resolveWorker(req: IncomingMessage): WorkerHandle | null {
    const sid = req.headers[STICKY_HEADER];
    const sidStr = Array.isArray(sid) ? sid[0] : sid;
    const now = Date.now();
    if (sidStr) {
      const entry = sticky.get(sidStr);
      if (entry) {
        if (now - entry.lastSeen > STICKY_TTL_MS) {
          sticky.delete(sidStr);
        } else {
          entry.lastSeen = now;
          const w = pool.workers().find((x) => x.id === entry.workerId && x.status === 'ready');
          if (w) return w;
          sticky.delete(sidStr); // sticky worker gone -> round-robin fallback
        }
      }
    }
    const picked = pool.pickHealthy();
    if (picked && sidStr) sticky.set(sidStr, { workerId: picked.id, lastSeen: now });
    return picked;
  }

  function sendJson(res: ServerResponse, status: number, obj: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  /** Transparent pipe: req -> worker, worker response (incl. SSE) -> res. */
  function proxyToWorker(
    worker: WorkerHandle,
    req: IncomingMessage,
    res: ServerResponse,
  ): void {
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: worker.port,
        path: req.url ?? '/',
        method: req.method ?? 'GET',
        headers: {
          ...req.headers,
          host: `127.0.0.1:${worker.port}`,
          ...(authHeader ? { authorization: authHeader } : {}),
        },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
        upRes.on('error', (err) => {
          logError(`upstream ${worker.id} response error`, err);
          res.destroy();
        });
      },
    );
    upstream.on('error', (err) => {
      logError(`upstream ${worker.id} connect error`, err);
      if (!res.headersSent) {
        sendJson(res, 502, { error: 'upstream error' });
      } else {
        res.destroy();
      }
    });
    req.pipe(upstream);
    res.on('close', () => {
      upstream.destroy();
    });
  }

  const server: Server = createServer((req, res) => {
    if (req.url === '/pool/status' && req.method === 'GET') {
      sendJson(res, 200, { workers: pool.workers() });
      return;
    }
    if (req.url === '/health' && req.method === 'GET') {
      const healthy = pool.workers().filter((w) => w.status === 'ready').length;
      res.writeHead(healthy > 0 ? 200 : 503, { 'content-type': 'text/plain' });
      res.end(healthy > 0 ? 'OK' : 'no ready workers');
      return;
    }
    const worker = resolveWorker(req);
    if (!worker) {
      sendJson(res, 503, { error: 'no healthy worker available' });
      return;
    }
    proxyToWorker(worker, req, res);
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  return {
    server,
    port: () => lbPort,
    url: () => `http://127.0.0.1:${lbPort}`,
    listen: () =>
      new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr === null || typeof addr === 'string') {
            reject(new Error('lb: no numeric address'));
            return;
          }
          lbPort = addr.port;
          resolve();
        });
      }),
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections?.();
      }),
  };
}