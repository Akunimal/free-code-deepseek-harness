import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Egress proxy rotator for the opencode2api gateway.
 *
 * The gateway tries `direct` first on every request (pool cursor starts at
 * index 0) and only advances to a proxy when the direct attempt returns a
 * non-2xx (for example OpenCode Zen's 403 FreeTierError to a blocked IP, or a
 * 429 daily cap). This rotator keeps the proxyfile the gateway reads populated
 * with public SOCKS5 proxies that currently reach opencode.ai.
 *
 * Security: candidates are verified by opening an end-to-end TLS session to
 * cloudflare.com and opencode.ai THROUGH the proxy, with full certificate
 * verification (`rejectUnauthorized: true`). A SOCKS5 proxy is only a TCP
 * tunnel, so a verified TLS session means the proxy cannot read or alter the
 * request body — it only forwards encrypted bytes and sees the destination
 * host, timing and volume. A proxy that tampers with TLS fails verification and
 * is dropped. Direct remains first, so the proxy lane is used only when the
 * user's own IP is blocked.
 */

export interface ProxyCandidate {
  ip: string;
  port: number;
}

export interface VerifiedProxy {
  address: string; // socks5h://ip:port
  ip: string;
  port: number;
  latencyMs: number;
}

export interface ProxyRotatorConfig {
  /** Absolute path to the proxyfile the gateway loads (config `proxyfile`). */
  proxyfilePath: string;
  /** Called when the healthy pool changes so the gateway can reload it. */
  onPoolChanged: (pool: VerifiedProxy[]) => void | Promise<void>;
  /** Minimum healthy proxies before a background re-harvest is triggered. */
  minPool?: number;
  /** Maximum proxies kept in the pool. */
  maxPool?: number;
  /** Re-harvest cadence (ms). Default 15 min. */
  refreshMs?: number;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
  /** User-visible stage changes: harvesting started, pool ready (with size), or no healthy proxy. */
  onStatus?: (status: 'harvesting' | 'ready' | 'empty', healthy: number) => void;
  /** Seam: fetch the raw candidate list. Defaults to the public proxifly feed. */
  fetchCandidates?: () => Promise<ProxyCandidate[]>;
  /** Seam: verify one candidate reaches opencode.ai over verified TLS. */
  verifyCandidate?: (candidate: ProxyCandidate) => Promise<{ ok: boolean; latencyMs: number }>;
}

const DEFAULT_MIN_POOL = 5;
const DEFAULT_MAX_POOL = 20;
const DEFAULT_REFRESH_MS = 15 * 60 * 1000;
const PROBE_TIMEOUT_MS = 4000;
const VERIFY_CONCURRENCY = 8;
const CANDIDATE_LIMIT = 100;

const CANDIDATE_SOURCES = [
  'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.json',
  'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.json',
];

/** Open a SOCKS5 (no-auth) tunnel to host:port through a proxy. */
function socks5Connect(
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  timeoutMs: number,
): Promise<import('node:net').Socket> {
  return new Promise((resolve, reject) => {
    const sock = netConnect(proxyPort, proxyHost);
    let state: 'greet' | 'connect' = 'greet';
    let buffer = Buffer.alloc(0);
    const fail = (error: Error): void => { try { sock.destroy(); } catch { /* ignore */ } reject(error); };
    sock.setTimeout(timeoutMs, () => fail(new Error('socks timeout')));
    sock.on('error', fail);
    sock.on('connect', () => sock.write(Buffer.from([0x05, 0x01, 0x00])));
    sock.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (state === 'greet') {
        if (buffer.length < 2) return;
        if (buffer[1] !== 0x00) return fail(new Error(`socks method rejected: ${buffer[1]}`));
        buffer = buffer.subarray(2);
        state = 'connect';
        const host = Buffer.from(targetHost, 'utf8');
        sock.write(Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
          host,
          Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]),
        ]));
        return;
      }
      if (buffer.length < 4) return;
      if (buffer[1] !== 0x00) return fail(new Error(`socks connect status ${buffer[1]}`));
      const atyp = buffer[3];
      let need = 4;
      if (atyp === 0x01) need += 4 + 2;
      else if (atyp === 0x03) { if (buffer.length < 5) return; need += 1 + buffer[4]! + 2; }
      else if (atyp === 0x04) need += 16 + 2;
      else return fail(new Error(`bad atyp ${atyp}`));
      if (buffer.length < need) return;
      sock.removeAllListeners('data');
      sock.setTimeout(0);
      resolve(sock);
    });
  });
}

/** GET host:443/path through an established socket with verified TLS. 200 only. */
function probeHttps(
  socket: import('node:net').Socket,
  host: string,
  path: string,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => { if (done) return; done = true; clearTimeout(timer); try { tls.destroy(); } catch { /* ignore */ } resolve(ok); };
    const timer = setTimeout(() => finish(false), timeoutMs);
    // rejectUnauthorized: true — a proxy that tampers with the TLS session to
    // opencode.ai cannot present a valid certificate and fails here.
    const tls = tlsConnect({ socket, servername: host, rejectUnauthorized: true }, () => {
      tls.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: curl/8.0\r\nConnection: close\r\n\r\n`);
    });
    let raw = '';
    tls.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8'); if (raw.length > 4096) finish(/\s200(\s|$)/.test(raw.split('\r\n')[0] ?? '')); });
    tls.on('end', () => finish(/\s200(\s|$)/.test(raw.split('\r\n')[0] ?? '')));
    tls.on('error', () => finish(false));
  });
}

async function defaultVerify(candidate: ProxyCandidate): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const cf = await socks5Connect(candidate.ip, candidate.port, 'cloudflare.com', 443, PROBE_TIMEOUT_MS);
    if (!(await probeHttps(cf, 'cloudflare.com', '/cdn-cgi/trace', 2500))) return { ok: false, latencyMs: Date.now() - start };
    const oc = await socks5Connect(candidate.ip, candidate.port, 'opencode.ai', 443, PROBE_TIMEOUT_MS);
    const ok = await probeHttps(oc, 'opencode.ai', '/', 2500);
    return { ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

async function defaultFetchCandidates(): Promise<ProxyCandidate[]> {
  for (const source of CANDIDATE_SOURCES) {
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;
      const data = (await response.json()) as Array<{ ip?: unknown; port?: unknown }>;
      if (!Array.isArray(data)) continue;
      const list = data
        .filter((item): item is { ip: string; port: number } =>
          typeof item.ip === 'string' && Number.isInteger(item.port))
        .map((item) => ({ ip: item.ip, port: item.port }));
      if (list.length > 0) return list;
    } catch {
      // try the next source
    }
  }
  return [];
}

/**
 * Whether a rotation stage deserves a user notification. Only transitions the
 * user can act on are shown: the first search with no route, routes becoming
 * available after none, and a search that ended with no route at all. Routine
 * 15-minute re-harvests while routes exist stay in the log only.
 */
export function shouldNotifyProxyStage(
  status: 'harvesting' | 'ready' | 'empty',
  healthy: number,
  previousPool: number,
): boolean {
  if (status === 'ready') return previousPool === 0;
  return healthy === 0;
}

export class ProxyRotator {
  private readonly cfg: Required<Pick<ProxyRotatorConfig, 'minPool' | 'maxPool' | 'refreshMs'>> & ProxyRotatorConfig;
  private pool: VerifiedProxy[] = [];
  private harvesting = false;
  private engaged = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(config: ProxyRotatorConfig) {
    this.cfg = {
      minPool: DEFAULT_MIN_POOL,
      maxPool: DEFAULT_MAX_POOL,
      refreshMs: DEFAULT_REFRESH_MS,
      ...config,
    };
  }

  private status(status: 'harvesting' | 'ready' | 'empty', healthy: number): void {
    this.cfg.onStatus?.(status, healthy);
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>): void {
    this.cfg.log?.(level, msg, meta);
  }

  /** Current healthy pool (read-only copy). */
  get healthy(): VerifiedProxy[] {
    return [...this.pool];
  }

  get isEngaged(): boolean {
    return this.engaged;
  }

  /**
   * Begin harvesting. Idempotent. Demand-driven: the caller engages this only
   * when the direct lane is persistently blocked (a non-retryable empty
   * catalog, i.e. Zen's 403 FreeTierError). While the user's own IP works no
   * proxy list is fetched and the gateway is never restarted.
   */
  engage(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.log('info', 'proxy rotator engaged (direct lane blocked)');
    void this.harvest();
    this.timer = setInterval(() => void this.harvest(), this.cfg.refreshMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  private writeProxyfile(): void {
    mkdirSync(dirname(this.cfg.proxyfilePath), { recursive: true });
    writeFileSync(this.cfg.proxyfilePath, `${this.pool.map((proxy) => proxy.address).join('\n')}\n`, 'utf8');
  }

  private async publish(): Promise<void> {
    this.writeProxyfile();
    await this.cfg.onPoolChanged(this.healthy);
  }

  async harvest(): Promise<void> {
    if (this.harvesting) return;
    this.harvesting = true;
    this.status('harvesting', this.pool.length);
    try {
      const fetchCandidates = this.cfg.fetchCandidates ?? defaultFetchCandidates;
      const verify = this.cfg.verifyCandidate ?? defaultVerify;
      const candidates = (await fetchCandidates()).slice(0, CANDIDATE_LIMIT);
      if (candidates.length === 0) {
        this.log('warn', 'proxy rotator: no candidates fetched; keeping current pool', { pool: this.pool.length });
        this.status('empty', this.pool.length);
        return;
      }
      const verified: VerifiedProxy[] = [];
      for (let i = 0; i < candidates.length && verified.length < this.cfg.maxPool; i += VERIFY_CONCURRENCY) {
        const slice = candidates.slice(i, i + VERIFY_CONCURRENCY);
        const results = await Promise.all(slice.map(async (candidate) => ({ candidate, ...(await verify(candidate)) })));
        for (const result of results) {
          if (result.ok && verified.length < this.cfg.maxPool) {
            verified.push({ address: `socks5h://${result.candidate.ip}:${result.candidate.port}`, ip: result.candidate.ip, port: result.candidate.port, latencyMs: result.latencyMs });
          }
        }
      }
      if (verified.length === 0) {
        this.log('warn', 'proxy rotator: no healthy proxies verified this run; keeping current pool', { pool: this.pool.length });
        this.status('empty', this.pool.length);
        return;
      }
      verified.sort((a, b) => a.latencyMs - b.latencyMs);
      this.pool = verified;
      await this.publish();
      this.log('info', 'proxy rotator: pool refreshed', { healthy: verified.length });
      this.status('ready', verified.length);
    } catch (error) {
      this.log('warn', 'proxy rotator: harvest failed', { error: error instanceof Error ? error.message : String(error) });
      this.status('empty', this.pool.length);
    } finally {
      this.harvesting = false;
    }
  }
}
