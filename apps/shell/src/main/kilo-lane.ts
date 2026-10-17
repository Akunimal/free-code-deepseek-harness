import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Kilo lane — loopback OpenAI-compatible endpoint for the DSH harness that
 * forwards to Kilo's anonymous free gateway (ai-gateway.kilo.ai). Replaces the
 * opencode2api sidecar. No binary is bundled: the gateway is Kilo's service.
 *
 * The harness authenticates to this loopback lane with the local public key.
 * The lane checks it, then strips every Authorization header before going
 * upstream: the Kilo gateway rejects `Bearer public` (401) but serves the free
 * models anonymously.
 */

export const KILO_GATEWAY_BASE_URL = 'https://ai-gateway.kilo.ai/api/v1';

export interface KiloLaneConfig {
  /** Local key the harness must present (Bearer or x-api-key). */
  apiKey: string;
  /** Upstream base that `/v1/*` maps onto. Defaults to the Kilo gateway. */
  upstreamBaseUrl?: string;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
}

export interface KiloLaneInstance {
  url: string; // http://127.0.0.1:<port>
  port: number;
  /** Key the lane accepts from local callers. */
  apiKey: string;
  stop(): Promise<void>;
}

const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept'] as const;

function localKeyMatches(req: IncomingMessage, apiKey: string): boolean {
  const auth = req.headers.authorization;
  if (auth === `Bearer ${apiKey}`) return true;
  return req.headers['x-api-key'] === apiKey;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function forward(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamBaseUrl: string,
  log: NonNullable<KiloLaneConfig['log']>,
): Promise<void> {
  const path = (req.url ?? '/').replace(/^\/v1/, '');
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  let upstream: Response;
  try {
    upstream = await fetch(`${upstreamBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : new Uint8Array(body),
    });
  } catch (error) {
    log('warn', 'kilo lane upstream unreachable', {
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(res, 502, { error: { message: 'Kilo gateway unreachable', type: 'upstream_unavailable' } });
    return;
  }
  const contentType = upstream.headers.get('content-type');
  res.writeHead(upstream.status, contentType ? { 'content-type': contentType } : {});
  if (upstream.body === null) {
    res.end();
    return;
  }
  Readable.fromWeb(upstream.body as never).pipe(res);
}

/** Start the loopback lane. Returns undefined when the listener cannot bind. */
export async function startKiloLane(config: KiloLaneConfig): Promise<KiloLaneInstance | undefined> {
  const log = config.log ?? (() => {});
  const upstreamBaseUrl = (config.upstreamBaseUrl ?? KILO_GATEWAY_BASE_URL).replace(/\/+$/, '');
  const server: Server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (!req.url?.startsWith('/v1/') && req.url !== '/v1') {
      sendJson(res, 404, { error: { message: 'not found' } });
      return;
    }
    if (!localKeyMatches(req, config.apiKey)) {
      sendJson(res, 401, { error: { message: 'invalid local key' } });
      return;
    }
    forward(req, res, upstreamBaseUrl, log).catch((error: unknown) => {
      log('error', 'kilo lane request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) sendJson(res, 500, { error: { message: 'lane error' } });
      else res.destroy();
    });
  });

  const port = await new Promise<number | undefined>((resolve) => {
    server.once('error', () => resolve(undefined));
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(addr && typeof addr !== 'string' ? addr.port : undefined);
    });
  });
  if (port === undefined) {
    log('warn', 'kilo lane failed to bind; free lane disabled');
    server.close();
    return undefined;
  }
  log('info', 'kilo lane ready', { port, upstream: upstreamBaseUrl });
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    apiKey: config.apiKey,
    stop: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
