import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import { detectLocalRoutes } from '../src/main/omniroute-detector.js';

describe('omniroute-detector', () => {
  let srv: Server;
  let port = 0;

  beforeAll(async () => {
    srv = createServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'proxy-model-1' }, { id: 'proxy-model-2' }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
    const addr = srv.address();
    if (addr !== null && typeof addr !== 'string') port = addr.port;
  });

  afterAll(() => new Promise<void>((resolve) => srv.close(() => resolve())));

  it('detects an OpenAI-compatible endpoint on localhost', async () => {
    const routes = await detectLocalRoutes({ ports: [port], timeoutMs: 800 });
    expect(routes).toHaveLength(1);
    expect(routes[0]!.port).toBe(port);
    expect(routes[0]!.baseURL).toBe(`http://127.0.0.1:${port}`);
    expect(routes[0]!.models).toEqual(['proxy-model-1', 'proxy-model-2']);
    expect(routes[0]!.latencyMs).toBeLessThan(500);
  });

  it('skips silent ports and returns empty', async () => {
    // Find a port with nothing listening.
    const dead = createServer();
    await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', () => resolve()));
    const deadAddr = dead.address();
    const deadPort = deadAddr !== null && typeof deadAddr !== 'string' ? deadAddr.port : 0;
    await new Promise<void>((resolve) => dead.close(() => resolve()));
    const routes = await detectLocalRoutes({ ports: [deadPort], timeoutMs: 800 });
    expect(routes).toHaveLength(0);
  });
});