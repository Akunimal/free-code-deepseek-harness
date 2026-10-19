import { createServer } from 'node:net';

/**
 * Pick a loopback port for a new FreeCode listener without touching anything
 * that already listens. Tries `preferred`, then the next port, and so on, up to
 * `attempts` ports. A port is taken only when a fresh exclusive bind succeeds;
 * a port that is busy (for example another local gateway) is skipped, never
 * reused or signalled.
 */
export async function pickFreePort(
  preferred: number,
  { host = '127.0.0.1', attempts = 50 }: { host?: string; attempts?: number } = {},
): Promise<number> {
  for (let offset = 0; offset < attempts; offset++) {
    const port = preferred + offset;
    if (port > 65535) break;
    if (await canBind(host, port)) return port;
  }
  throw new Error(`no free loopback port in ${preferred}..${preferred + attempts - 1}`);
}

function canBind(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    // exclusive: true makes Windows refuse to share a port with another socket.
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}
