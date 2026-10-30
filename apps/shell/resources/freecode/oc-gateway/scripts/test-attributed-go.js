'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { readSocksGreeting, readSocksConnectRequest, socksReply } = require('./socks5');
const { createAttempt, finishAttempt } = require('./exit-registry');
const { normalizePoolConfig } = require('./runtime-config');
const { prepareManualAvailability } = require('./manual-availability');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-attributed-go-'));
process.env.OC_GATEWAY_HOME = home;
const model = 'mimo-v2.6-flash-free';
const tokens = ['a'.repeat(32), 'b'.repeat(32)];
const sockets = new Set();
const servers = [];
let child, output = '';
async function listen(server) {
  servers.push(server);
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function main() {
  const mock = http.createServer((req, res) => {
    req.resume();
    if (req.method !== 'POST') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: model }] }));
    assert.equal(req.headers['x-gateway-attempt'], undefined, 'local identity must not leak upstream');
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3600' }).end(JSON.stringify({ error: { message: 'local quota fixture' } }));
  });
  const mockPort = await listen(mock);
  const addresses = [];
  const dials = new Map();
  for (let i = 0; i < 3; i++) {
    const server = net.createServer(socket => {
      void (async () => {
        const state = { buffer: Buffer.alloc(0) };
        await readSocksGreeting(socket, state, { timeoutMs: 1000 });
        socket.write(Buffer.from([5, 0]));
        const target = await readSocksConnectRequest(socket, state, { timeoutMs: 1000 });
        dials.set(i, (dials.get(i) || 0) + 1);
        // A local SOCKS success followed by TLS EOF exercises both Go lanes.
        // No external connection is ever made by these exits.
        if (target.host === '127.0.0.1' && target.port === mockPort) {
          const local = net.connect(mockPort, '127.0.0.1', () => { socket.write(socksReply(0)); socket.pipe(local); local.pipe(socket); });
          sockets.add(local);
          local.on('error', () => socket.destroy());
          local.once('close', () => sockets.delete(local));
          socket.once('close', () => local.destroy());
        } else socket.end(socksReply(0));
      })().catch(() => socket.destroy());
    });
    addresses.push(`socks5h://127.0.0.1:${await listen(server)}`);
  }
  fs.mkdirSync(path.join(home, 'data'), { recursive: true });
  fs.writeFileSync(path.join(home, 'data', 'proxies.txt'), addresses.join('\n'));
  const front = require('./pool-front');
  const frontPort = await listen(front.createServer());
  const guard = http.createServer((req, res) => res.writeHead(502).end());
  guard.on('connect', (req, socket) => socket.end('HTTP/1.1 502 blocked\r\n\r\n'));
  const guardPort = await listen(guard);
  const allocation = net.createServer();
  const apiPort = await listen(allocation);
  await new Promise(resolve => allocation.close(resolve));
  const declared = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.example.json')));
  const config = normalizePoolConfig({ ...declared, server_keys: ['isolated-key'], zen_keys: [], go_keys: [], anonymous: true,
    models: { refresh_seconds: 3600, free_only: false, protocols: { [model]: 'chat' } },
    webui: { ...declared.webui, enabled: false }, upstream: { zen: `http://127.0.0.1:${mockPort}/v1`, anonymous: 'https://opencode.ai/inference' } });
  config.proxies = [`socks5h://127.0.0.1:${frontPort}#pool`];
  config.retry.timeout_seconds = 6;
  const configPath = path.join(home, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config));
  prepareManualAvailability(configPath, config);
  const start = async () => {
  output = '';
  child = spawn(process.env.OPENCODE2API_EXE || path.resolve(__dirname, '..', 'data', 'opencode2api-attributed.exe'),
    ['-config', configPath, '-listen', `127.0.0.1:${apiPort}`], { cwd: home, windowsHide: true,
      env: { ...process.env, OC_EXIT_IDENTITY: '1', OC_POOL_FRONT_PORT: String(frontPort),
        HTTP_PROXY: `http://127.0.0.1:${guardPort}`, HTTPS_PROXY: `http://127.0.0.1:${guardPort}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  for (let i = 0; !output.includes('server_started'); i++) {
    if (i > 150 || child.exitCode !== null) throw Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  };
  await start();
  const infer = async (token, expectedStatus) => {
    createAttempt(home, token, model, 30_000);
    const response = await fetch(`http://127.0.0.1:${apiPort}/v1/chat/completions`, { method: 'POST',
      headers: { Authorization: 'Bearer isolated-key', 'Content-Type': 'application/json', 'X-Gateway-Attempt': token },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'local mock' }] }), signal: AbortSignal.timeout(12_000) });
    await response.text();
    assert.equal(response.status, expectedStatus, output);
    if (expectedStatus === 429) {
      assert.equal(response.headers.get('x-gateway-upstream-response'), '1');
      assert.equal(response.headers.get('retry-after'), '3600');
    } else {
      assert.equal(response.headers.get('x-gateway-transport-failure'), '1', 'Go distinguishes failed SOCKS/TLS from an upstream response');
    }
  };
  await Promise.all(tokens.map(token => infer(token, 503)));
  let exits = tokens.map(token => front.registry.pin(token));
  assert.ok(exits.every(value => addresses.includes(value)), `actual binary did not authenticate: ${output}`);
  assert.notEqual(exits[0], exits[1], 'concurrent requests retain different identities');
  assert.ok(exits.every(address => dials.get(addresses.indexOf(address)) >= 2), 'v2 and v1 use their request-pinned exit');
  for (const token of tokens) finishAttempt(home, token, { outcome: 'cancelled', status: 499 });
  front.registry.collect();
  tokens.splice(0, 2, 'c'.repeat(32), 'd'.repeat(32));
  const stopped = once(child, 'exit'); child.kill(); await stopped;
  config.anonymous = false;
  config.zen_keys = ['isolated-upstream-key'];
  fs.writeFileSync(configPath, JSON.stringify(config));
  await start();
  await Promise.all(tokens.map(token => infer(token, 429)));
  exits = tokens.map(token => front.registry.pin(token));
  finishAttempt(home, tokens[0], { outcome: 'quota', status: 429, upstreamResponded: true, retryAfterMs: 3600_000 });
  finishAttempt(home, tokens[1], { outcome: 'cancelled', status: 499 });
  front.registry.collect();
  const entry = front.reserveExit(new Set(), model);
  assert.notEqual(entry.address, exits[0], 'quota exit is ineligible for this model');
  front.releaseExit(entry);
  assert.ok(front.registry.until(exits[0], model) > Date.now() + 3590_000);
  console.log('PASS actual Go v2/v1 SOCKS authentication, concurrent pinned exits, exact quota quarantine; all egress ends at local mocks');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  for (const socket of sockets) socket.destroy();
  for (const server of servers) if (server.listening) await new Promise(resolve => server.close(resolve));
  fs.rmSync(home, { recursive: true, force: true });
});
