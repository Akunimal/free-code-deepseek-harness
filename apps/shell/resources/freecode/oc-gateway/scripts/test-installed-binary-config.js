'use strict';

// Launches the exact installed Go binary only with temporary config and local mocks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { normalizePoolConfig } = require('./runtime-config');

const binary = process.env.OPENCODE2API_EXE || path.resolve(__dirname, '..', 'bin', 'opencode2api.exe');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-installed-config-'));
const children = [];
const servers = [];
const blockedEgress = [];
const sockets = new Set();
let output = '';
function infer(apiPort) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: apiPort, path: '/v1/chat/completions', method: 'POST', headers: { Authorization: 'Bearer isolated-test-key', 'Content-Type': 'application/json' } }, res => {
      res.resume(); res.once('end', () => resolve(res.statusCode)); res.once('error', reject);
    });
    const timer = setTimeout(() => request.destroy(new Error('isolated binary inference deadline')), 8000);
    request.once('close', () => clearTimeout(timer)); request.once('error', reject);
    request.end(JSON.stringify({ model: 'mimo-v2.6-flash-free', messages: [{ role: 'user', content: 'isolated mock only' }] }));
  });
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited;
}

async function listen(server) {
  servers.push(server);
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    setTimeout(() => finish(false), 100).unref();
  });
}

async function waitFor(predicate, child, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`binary exited early (${child.exitCode}): ${output}`);
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`timed out waiting for isolated binary: ${output}`);
}

function fixture(upstream, listenAddress, guardPort) {
  const declaredPath = path.resolve(__dirname, '..', 'config', 'config.json');
  let declared = {};
  try { declared = JSON.parse(fs.readFileSync(declaredPath, 'utf8')); } catch {}
  declared = {
    ...declared,
    server_keys: ['isolated-test-key'],
    zen_keys: ['isolated-upstream-key'],
    go_keys: [],
    anonymous: false,
    prefer: 'zen',
    models: { refresh_seconds: 3600, free_only: false, protocols: { 'mimo-v2.6-flash-free': 'chat' } },
    upstream: { zen: upstream, go: upstream },
    logging: { ...(declared.logging || {}), ring_size: Math.max(100, declared.logging?.ring_size || 100), dump_request_bodies: false },
    webui: { ...(declared.webui || {}), enabled: false, listen: '127.0.0.1:0', username: 'isolated', password_hash: '' }
  };
  const config = normalizePoolConfig(declared);
  config.listen = listenAddress;
  // Force inference through a loopback proxy that only forwards the local mock.
  // "direct" ignores proxy environment variables in the installed Go binary.
  config.proxies = [`http://127.0.0.1:${guardPort}`];
  config.retry.timeout_seconds = Math.max(1, Math.min(config.retry.timeout_seconds || 5, 5));
  return config;
}

function run(configPath, apiPort, webPort, guardPort) {
  const child = spawn(binary, ['-config', configPath, '-listen', `127.0.0.1:${apiPort}`,
    '-web-listen', `127.0.0.1:${webPort}`], {
    cwd: home,
    windowsHide: true,
    env: {
      ...process.env,
      HTTP_PROXY: `http://127.0.0.1:${guardPort}`,
      HTTPS_PROXY: `http://127.0.0.1:${guardPort}`,
      ALL_PROXY: `http://127.0.0.1:${guardPort}`,
      http_proxy: `http://127.0.0.1:${guardPort}`,
      https_proxy: `http://127.0.0.1:${guardPort}`,
      all_proxy: `http://127.0.0.1:${guardPort}`,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  return child;
}

async function main() {
  assert.ok(fs.existsSync(binary), `installed binary missing: ${binary}`);

  // Any non-local HTTP request is caught by a local proxy that refuses it. The binary is
  // never given a real upstream URL or credential in this test.
  let allowedUpstreamPort;
  let stubAnonymousTls = false;
  const egressGuard = http.createServer((req, res) => {
    let target;
    try { target = new URL(req.url); } catch {}
    if (!target || target.hostname !== '127.0.0.1' || Number(target.port) !== allowedUpstreamPort) {
      blockedEgress.push(req.url);
      return res.writeHead(502, { Connection: 'close' }).end('blocked by isolated test');
    }
    const forward = http.request({ host: '127.0.0.1', port: allowedUpstreamPort, path: target.pathname + target.search, method: req.method, headers: req.headers }, reply => {
      res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    });
    forward.on('error', () => res.writeHead(502).end());
    req.pipe(forward);
  });
  egressGuard.on('connect', (req, socket, head) => {
    if (req.url !== `127.0.0.1:${allowedUpstreamPort}`) {
      blockedEgress.push(req.url);
      // Establish only a local empty tunnel, never a connection to this host.
      // TLS EOF lets the binary exercise its next-endpoint decision safely.
      if (stubAnonymousTls && req.url === 'opencode.ai:443') return socket.end('HTTP/1.1 200 Connection Established\r\n\r\n');
      return socket.end('HTTP/1.1 502 blocked by isolated test\r\nConnection: close\r\n\r\n');
    }
    const tunnel = net.connect({ host: '127.0.0.1', port: allowedUpstreamPort }, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) tunnel.write(head);
      socket.pipe(tunnel); tunnel.pipe(socket);
    });
    tunnel.on('error', () => socket.destroy()); socket.on('error', () => tunnel.destroy()); socket.on('close', () => tunnel.destroy());
  });
  const guardPort = await listen(egressGuard);

  const upstreamCalls = [];
  let failure = 'quota';
  const upstream = http.createServer((req, res) => {
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks));
        upstreamCalls.push({ model: body.model, path: req.url });
        if (failure === 'reset') return req.socket.destroy();
        res.writeHead(({ quota: 429, auth: 401, invalid: 400 })[failure] || 503, { 'Content-Type': 'application/json', 'Retry-After': '60' });
        res.end(JSON.stringify({ error: { message: 'isolated mock failure' } }));
      });
      return;
    }
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'mimo-v2.6-flash-free', object: 'model' }] }));
  });
  const upstreamPort = await listen(upstream);
  allowedUpstreamPort = upstreamPort;
  const upstreamUrl = `http://127.0.0.1:${upstreamPort}/v1`;
  const configPath = path.join(home, 'config.json');
  const apiPort = await listen(net.createServer());
  const webPort = await listen(net.createServer());
  // Reserve the two selected ports only during allocation; the binary binds them next.
  for (const server of servers.slice(-2)) await new Promise(resolve => server.close(resolve));
  servers.splice(-2, 2);

  const config = fixture(upstreamUrl, `127.0.0.1:${apiPort}`, guardPort);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  const invalidPath = path.join(home, 'invalid-config.json');
  fs.writeFileSync(invalidPath, JSON.stringify({ ...config,
    rotation: { ...config.rotation, sota: { alias: 'sota', order: ['not-a-built-in-model'] } }
  }, null, 2));
  const invalid = run(invalidPath, apiPort, webPort, guardPort);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`invalid config was accepted: ${output}`)), 5000);
    invalid.once('exit', code => { clearTimeout(timer); resolve(code); });
  }).then(code => assert.notEqual(code, 0, 'invalid rotation config must be rejected'));
  assert.match(output, /rotation|SOTA|model|模型顺序/i, 'binary reports the invalid rotation config');

  output = '';
  const valid = run(configPath, apiPort, webPort, guardPort);
  await waitFor(() => portOpen(apiPort), valid);
  await new Promise(resolve => setTimeout(resolve, 750));
  assert.equal(valid.exitCode, null, `valid normalized config must stay running: ${output}`);
  if (process.env.EXPECTED_GO_VERSION) assert.ok(output.includes(`"version":"${process.env.EXPECTED_GO_VERSION}"`), 'installed startup log confirms requested release');
  console.log(`PASS selected installed binary ${process.env.EXPECTED_GO_VERSION || ''} rejects invalid rotation and starts with normalized config`);
  console.log('PASS binary listened on isolated loopback port with only local upstream configured');
  for (const mode of ['quota', 'unavailable', 'reset', 'auth', 'invalid']) {
    failure = mode;
    upstreamCalls.length = 0;
    const response = await infer(apiPort);
    assert.equal(upstreamCalls.length, 1, `retry.max_attempts=1 must issue one upstream call for ${mode}, HTTP ${response}: ${JSON.stringify(upstreamCalls)}; blocked=${JSON.stringify(blockedEgress)}; output=${output.slice(-5000)}`);
    assert.equal(upstreamCalls[0].model, 'mimo-v2.6-flash-free');
    console.log(`PASS installed binary retry.max_attempts=1: ${mode}, one same-model upstream call, HTTP ${response}`);
  }
  await stop(valid);
  stubAnonymousTls = true;
  for (const capped of [false, true]) {
    output = '';
    failure = 'quota';
    const anonConfig = { ...config, anonymous: true, zen_keys: [],
      performance: { ...config.performance, failure_cooldown_seconds: 1 },
      upstream: { ...config.upstream, anonymous: capped ? 'https://opencode.ai/zen' : upstreamUrl }
    };
    const anonPath = path.join(home, capped ? 'anonymous-capped.json' : 'anonymous-two-origins.json');
    fs.writeFileSync(anonPath, JSON.stringify(anonConfig));
    const anon = run(anonPath, apiPort, webPort, guardPort);
    await waitFor(() => portOpen(apiPort), anon);
    await new Promise(resolve => setTimeout(resolve, 1500));
    upstreamCalls.length = 0;
    const before = blockedEgress.filter(target => target === 'opencode.ai:443').length;
    const response = await infer(apiPort);
    const tlsLegs = blockedEgress.filter(target => target === 'opencode.ai:443').length - before;
    assert.equal(tlsLegs, 1, `one intercepted local TLS leg, capped=${capped}: ${output.slice(-2000)}`);
    assert.equal(upstreamCalls.length, capped ? 0 : 1, `anonymous endpoint fallback capped=${capped}, HTTP ${response}: ${output.slice(-3000)}`);
    console.log(`PASS installed anonymous ${capped ? 'single-origin configuration suppresses the hidden fallback' : 'control fixture demonstrates the hidden fallback'}; local TLS stubs=${tlsLegs}, local fallback calls=${upstreamCalls.length}`);
    await stop(anon);
  }
  const v2Config = { ...config, anonymous: true, zen_keys: [], upstream: { ...config.upstream, anonymous: 'https://opencode.ai/inference' } };
  const v2Path = path.join(home, 'anonymous-official-v2.json');
  fs.writeFileSync(v2Path, JSON.stringify(v2Config));
  output = '';
  const v2 = run(v2Path, apiPort, webPort, guardPort);
  await waitFor(() => portOpen(apiPort), v2);
  await new Promise(resolve => setTimeout(resolve, 300));
  const beforeV2 = blockedEgress.filter(target => target === 'opencode.ai:443').length;
  await infer(apiPort);
  assert.equal(blockedEgress.filter(target => target === 'opencode.ai:443').length - beforeV2, 2, 'official v2 plus v1 compatibility fallback: two confined TLS legs, not model substitution');
  await stop(v2);
  console.log('PASS official v2 plus v1 fallback observed as exactly two confined legs per anonymous backend attempt');
  console.log(`PASS inference transport permits only the loopback mock; ${blockedEgress.length} nonlocal destinations blocked`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
    }
  }
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.map(server => new Promise(resolve => {
    try { server.closeAllConnections?.(); server.close(resolve); } catch { resolve(); }
  })));
  const resolved = path.resolve(home);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('oc-installed-config-')) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
