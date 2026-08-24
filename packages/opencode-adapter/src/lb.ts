import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest, type ClientRequest, type IncomingMessage as HttpIncomingMessage } from 'node:http';
import type { Pool, WorkerHandle } from './types.js';

const STICKY_TTL_MS = 30 * 60 * 1_000; // 30 min
const STICKY_HEADER = 'x-dsh-session-id';

/**
 * Bounded fan-out retry across workers when the upstream fails before
 * downstream headers are sent. Each attempt is a different worker (a
 * different opencode2api exit rotation), so a transient 429/5xx from one
 * exit does not surface as a user-visible error when another exit would
 * have served the request.
 *
 * The invariant is the "downstream_started" guard: once we call
 * `res.writeHead(...)` and start piping the upstream body, we can never
 * retry — a second HTTP response cannot be spliced onto an already-open
 * stream. Everything below is arranged to make that boundary explicit.
 */
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
/** 5xx / connect: park the worker briefly so the next request skips it. */
const PARK_MS_FOR_5XX = 8_000;
/** 429 rotates exit; do not park (the retry naturally lands elsewhere). */
const PARK_MS_FOR_429 = 0;
/** Per-attempt socket ceiling. A dead worker exit stalls forever without
 *  this; the pool's health poll only fires every 5s and cannot rescue a
 *  request already piped through. */
const REQUEST_SOCKET_TIMEOUT_MS = 600_000;
/** Idle read timeout on the upstream response body. Streaming completions
 *  can pause for a while between deltas, but 180s with no bytes indicates
 *  a dead exit — better to fail the request than hold the client forever. */
const RESPONSE_IDLE_TIMEOUT_MS = 180_000;
/** Bodies larger than this bypass the buffer-and-replay retry mechanism:
 *  chat completions are always small, uploads / SSE bodies are rare. */
const RETRY_BODY_CAP_BYTES = 10 * 1024 * 1024;

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
  /**
   * Fired once when EVERY ready worker has returned 429 within the detection
   * window with no successful (2xx) response in between — i.e. the whole pool
   * is rate-limited and per-request retry can no longer route around it. The
   * shell uses this to offer/auto-enable Tor Fleet exit rotation. Fires again
   * only after the pool recovers (some worker serves a 2xx) and degrades anew.
   */
  onAllWorkersRateLimited?: () => void;
}

/** How long a worker's 429 marker stays "fresh" for the all-rate-limited
 *  check. A worker whose last 429 is older than this is treated as unknown,
 *  not rate-limited, so a brief historical 429 does not latch the alarm. */
const RATE_LIMIT_WINDOW_MS = 30_000;

export function createLoadBalancer(opts: LoadBalancerOptions): LoadBalancer {
  const { pool, authHeader } = opts;
  const sticky = new Map<string, StickyEntry>();
  const logError =
    opts.logError ?? ((msg: string, err?: unknown) => console.error(`[lb] ${msg}`, err ?? ''));
  let lbPort = 0;

  // ---- pool-wide rate-limit detection ----
  // Per-worker timestamp of the last 429. A 2xx clears the entry. When every
  // ready worker has a fresh 429 and none is cleared, the whole pool is
  // rate-limited and onAllWorkersRateLimited fires once (latched until the
  // pool recovers).
  const lastRateLimitAt = new Map<string, number>();
  let allRateLimitedLatched = false;

  function noteWorkerOutcome(workerId: string, rateLimited: boolean): void {
    if (rateLimited) {
      lastRateLimitAt.set(workerId, Date.now());
    } else {
      // Any non-429 terminal outcome clears the worker and re-arms the alarm.
      lastRateLimitAt.delete(workerId);
      allRateLimitedLatched = false;
    }
    evaluatePoolRateLimit();
  }

  function evaluatePoolRateLimit(): void {
    if (allRateLimitedLatched || !opts.onAllWorkersRateLimited) return;
    const ready = pool.workers().filter((w) => w.status === 'ready');
    if (ready.length === 0) return; // no pool to judge
    const now = Date.now();
    const allFreshlyRated = ready.every((w) => {
      const at = lastRateLimitAt.get(w.id);
      return at !== undefined && now - at <= RATE_LIMIT_WINDOW_MS;
    });
    if (allFreshlyRated) {
      allRateLimitedLatched = true;
      try { opts.onAllWorkersRateLimited(); }
      catch (err) { logError('onAllWorkersRateLimited handler threw', err); }
    }
  }

  function stickyId(req: IncomingMessage): string | undefined {
    const sid = req.headers[STICKY_HEADER];
    return Array.isArray(sid) ? sid[0] : sid;
  }

  function resolveSticky(sidStr: string | undefined): WorkerHandle | null {
    if (!sidStr) return null;
    const now = Date.now();
    const entry = sticky.get(sidStr);
    if (!entry) return null;
    if (now - entry.lastSeen > STICKY_TTL_MS) {
      sticky.delete(sidStr);
      return null;
    }
    entry.lastSeen = now;
    const w = pool.workers().find((x) => x.id === entry.workerId && x.status === 'ready');
    if (!w) {
      sticky.delete(sidStr);
      return null;
    }
    return w;
  }

  function commitSticky(sidStr: string | undefined, workerId: string): void {
    if (!sidStr) return;
    sticky.set(sidStr, { workerId, lastSeen: Date.now() });
  }

  function sendJson(res: ServerResponse, status: number, obj: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  /** Read the entire request body into a Buffer, capped. Requests whose body
   *  exceeds the cap fall back to single-attempt piping (no retry) — the
   *  caller decides. Returns null when the body was too large to buffer. */
  async function bufferRequestBody(req: IncomingMessage): Promise<Buffer | null> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > RETRY_BODY_CAP_BYTES) return null;
      chunks.push(buf);
    }
    return Buffer.concat(chunks, total);
  }

  /** Forward one request to one worker. Resolves with the upstream response
   *  headers so the caller can decide retry vs. commit. Body streaming is
   *  the caller's responsibility once it commits.
   *
   *  If the upstream connects but never responds (dead exit), the socket
   *  timeout fires and rejects. If the upstream connect itself fails, the
   *  'error' event rejects. Either way the caller can retry ONLY when it
   *  has not yet written downstream headers. */
  function attemptRequest(
    worker: WorkerHandle,
    req: IncomingMessage,
    body: Buffer | null,
    res: ServerResponse,
  ): Promise<{ upstream: ClientRequest; upRes: HttpIncomingMessage } | { error: Error }> {
    return new Promise((resolve) => {
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
          timeout: REQUEST_SOCKET_TIMEOUT_MS,
        },
        (upRes) => resolve({ upstream, upRes }),
      );
      upstream.on('error', (error) => resolve({ error }));
      upstream.on('timeout', () => {
        upstream.destroy(new Error(`upstream ${worker.id} socket timeout`));
      });
      // Downstream close aborts the in-flight upstream — no leaked sockets.
      const onClose = (): void => { upstream.destroy(); };
      res.once('close', onClose);
      // Release the listener once the upstream settles (either response or
      // error), otherwise successive attempts double-register on `res`.
      upstream.once('close', () => res.removeListener('close', onClose));

      if (body !== null) {
        upstream.end(body);
      } else {
        // No buffered body — pipe the live request (single-attempt path).
        req.pipe(upstream);
      }
    });
  }

  /**
   * Drain and discard an upstream response so the socket returns to the
   * agent's pool cleanly, then move on. Safer than a bare destroy()
   * which can log noisy ECONNRESET on the worker side.
   */
  function drainAndDiscard(upRes: HttpIncomingMessage): void {
    upRes.resume();
    upRes.on('error', () => { /* discarded */ });
  }

  /**
   * Server handler with bounded fan-out retry. See the module-header
   * comment for the downstream_started invariant.
   */
  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sidStr = stickyId(req);
    const tried = new Set<string>();
    let lastStatus = 502;
    let lastHeaders: Record<string, string | string[] | undefined> = {};
    let lastError: unknown = null;
    let lastUpstreamPeek: HttpIncomingMessage | null = null;

    // Buffer the body once so each attempt can replay it. Large bodies fall
    // through to single-attempt piping.
    const bufferedBody = req.method && req.method !== 'GET' && req.method !== 'HEAD'
      ? await bufferRequestBody(req)
      : Buffer.alloc(0);
    const canRetry = bufferedBody !== null;

    // First attempt honors sticky; retries always fan out to a new worker.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let worker: WorkerHandle | null = null;
      if (attempt === 0) {
        worker = resolveSticky(sidStr) ?? pool.pickHealthy(tried);
      } else {
        worker = pool.pickHealthy(tried);
      }
      if (!worker) break;
      tried.add(worker.id);

      const result = await attemptRequest(worker, req, canRetry ? bufferedBody : null, res);

      if ('error' in result) {
        // Connect error / socket timeout. Retry if downstream is still
        // pristine; otherwise the pipe is committed and we must destroy.
        lastError = result.error;
        logError(`upstream ${worker.id} attempt ${attempt + 1}/${MAX_ATTEMPTS} connect error`, result.error);
        pool.parkWorker(worker.id, PARK_MS_FOR_5XX);
        if (res.headersSent) {
          res.destroy();
          return;
        }
        if (!canRetry) break; // body was not buffered — cannot replay
        continue;
      }

      const { upstream, upRes } = result;
      const status = upRes.statusCode ?? 502;
      // Record the pool-wide rate-limit signal on every terminal upstream
      // status, retry or commit. 429 marks the worker rate-limited; anything
      // else clears it. This drives onAllWorkersRateLimited.
      noteWorkerOutcome(worker.id, status === 429);
      const retryable = RETRYABLE_STATUSES.has(status) && !res.headersSent && attempt < MAX_ATTEMPTS - 1 && canRetry;

      if (retryable) {
        lastStatus = status;
        lastHeaders = upRes.headers;
        lastUpstreamPeek = upRes;
        drainAndDiscard(upRes);
        upstream.destroy();
        pool.parkWorker(worker.id, status === 429 ? PARK_MS_FOR_429 : PARK_MS_FOR_5XX);
        continue;
      }

      // Commit: from here downstream_started, no retry regardless of errors.
      commitSticky(sidStr, worker.id);
      res.writeHead(status, upRes.headers);
      // Idle timeout on the upstream body — a stalled exit will not hold
      // the client forever.
      upRes.setTimeout(RESPONSE_IDLE_TIMEOUT_MS, () => {
        logError(`upstream ${worker!.id} response idle timeout`);
        upRes.destroy(new Error('upstream idle timeout'));
      });
      upRes.pipe(res);
      upRes.on('error', (err) => {
        logError(`upstream ${worker!.id} response error (post-headers)`, err);
        res.destroy();
      });
      return;
    }

    // Exhausted every attempt or ran out of workers. Return the last
    // upstream status/body when we saw one — the OpenAI-compatible client
    // usually surfaces 429 details to the user better than an opaque 502.
    if (lastUpstreamPeek && !res.headersSent) {
      // We already drained the peek, so replay just the status + headers.
      // The body is intentionally empty (real body was drained during
      // retry); the client sees the last upstream status without stale
      // partial content.
      res.writeHead(lastStatus, lastHeaders);
      res.end();
      return;
    }
    if (!res.headersSent) {
      if (lastError) {
        sendJson(res, 502, { error: 'upstream error', detail: lastError instanceof Error ? lastError.message : String(lastError) });
      } else {
        sendJson(res, 503, { error: 'no healthy worker available' });
      }
    }
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
    void handleRequest(req, res).catch((err) => {
      logError('handleRequest fatal', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'lb internal error' });
      else res.destroy();
    });
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
