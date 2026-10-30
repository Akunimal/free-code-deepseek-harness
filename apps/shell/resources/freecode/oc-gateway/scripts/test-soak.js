'use strict';

// Real elapsed-time soak of one long-lived ingress. Only ephemeral loopback mocks.
// Default is the required hour; --seconds permits a harness smoke check.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const seconds = Number(process.argv[process.argv.indexOf('--seconds') + 1]) || 3600;
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-soak-'));
const samples = [];
let child;
let mode = 'ok';
let cycles = 0;
let failures = 0;
let output = '';
let activeMockSockets = 0;
const coverage = Object.create(null);
const servers = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function listen(server) {
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
function request(port, method = 'GET', url = '/livez', cancel = false) {
  return new Promise(resolve => {
    let done = false;
    let timer;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    const req = http.request({ host: '127.0.0.1', port, path: url, method, agent: false }, res => {
      res.resume();
      res.on('end', () => finish(res.statusCode));
      res.on('error', () => finish(0));
      res.on('aborted', () => finish(0));
    });
    req.on('error', () => finish(0));
    timer = setTimeout(() => { req.destroy(); finish(0); }, cancel ? 40 : 4000);
    if (method === 'POST') req.write(JSON.stringify({ model: `soak-${cycles % 32}`, stream: true, messages: [{ role: 'user', content: 'mock' }] }));
    req.end();
  });
}
async function main() {
  fs.mkdirSync(path.join(home, 'config'));
  fs.writeFileSync(path.join(home, 'config', 'config.json'), '{}');
  const mock = http.createServer((req, res) => {
    req.resume();
    if (req.method === 'GET') return res.writeHead(404).end();
    if (mode === 'ok' && req.url === '/v1/systemone') {
      return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"answers":{"choice":false,"value":0}}');
    }
    if (mode === 'reset') return req.socket.destroy();
    if (mode === 'quota') return res.writeHead(429, { 'Retry-After': '60' }).end('{}');
    if (mode === 'reject') return res.writeHead(403).end('{}');
    if (mode === 'hang' || mode === 'cancel') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const timer = setInterval(() => res.write(': keepalive\n\n'), 20);
      res.once('close', () => clearInterval(timer));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
    if (mode === 'cut') return setTimeout(() => res.destroy(), 10);
    res.end('data: [DONE]\n\n');
  });
  mock.on('connection', socket => { activeMockSockets++; socket.once('close', () => activeMockSockets--); });
  const backend = await listen(mock);
  const reservation = net.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const preload = path.join(home, 'sample.cjs');
  fs.writeFileSync(preload, `setInterval(() => process.send?.({ sample: true, rss: process.memoryUsage().rss, heap: process.memoryUsage().heapUsed, handles: process._getActiveHandles().length, resources: process.getActiveResourcesInfo() }), 1000).unref();`);
  child = spawn(process.execPath, ['--require', preload, path.join(__dirname, 'proxy.js')], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    // Four sequential retries include 250–500ms pacing each. A 300ms fixture
    // deadline only tested early timeout and could never reach a fourth exit.
    env: { ...process.env, OC_GATEWAY_HOME: home, PROXY_PORT: String(port), GATEWAY_PORT: String(backend), DIRECT_GATEWAY_PORT: String(backend), FIRST_CONTENT_BUDGET_MS: '2000', POOL_FIRST_EVENT_TIMEOUT_MS: '100', INACTIVITY_TIMEOUT_MS: '500' }
  });
  child.on('message', sample => { if (sample.sample) samples.push({ elapsed: Date.now() - started, ...sample }); });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-4000); });
  const started = Date.now();
  for (let tries = 0; tries < 100 && await request(port) !== 200; tries++) await delay(100);
  assert.equal(await request(port), 200, output);
  const modes = ['ok', 'reset', 'quota', 'reject', 'hang', 'cut', 'cancel', 'ok'];
  while (Date.now() - started < seconds * 1000) {
    mode = modes[cycles % modes.length];
    const endpoint = ['/v1/chat/completions', '/v1/responses', '/v1/messages', '/v1/systemone'][Math.floor(cycles / modes.length) % 4];
    coverage[`${endpoint}:${mode}`] = (coverage[`${endpoint}:${mode}`] || 0) + 1;
    const status = await request(port, 'POST', endpoint, mode === 'cancel');
    if (mode === 'ok' && status !== 200) failures++;
    if (mode === 'quota' && ![429, 503].includes(status)) failures++;
    if (mode === 'reject' && ![403, 503].includes(status)) failures++;
    if (await request(port) !== 200) failures++;
    assert.equal(child.exitCode, null, output);
    cycles++;
    if (cycles % 60 === 0) console.log(JSON.stringify({ progress: true, elapsed_s: Math.floor((Date.now() - started) / 1000), cycles, failures, sockets: activeMockSockets, sample: samples.at(-1) }));
    await delay(500);
  }
  const mature = samples.filter(sample => sample.elapsed >= Math.min(300000, seconds * 250));
  const first = mature.slice(0, Math.max(1, Math.floor(mature.length / 4)));
  const last = mature.slice(-Math.max(1, Math.floor(mature.length / 4)));
  const mean = (items, key) => items.reduce((sum, value) => sum + value[key], 0) / items.length;
  const growth = { rss: mean(last, 'rss') - mean(first, 'rss'), heap: mean(last, 'heap') - mean(first, 'heap'), handles: mean(last, 'handles') - mean(first, 'handles') };
  const timerCount = sample => sample.resources.filter(name => name === 'Timeout').length;
  const timerGrowth = last.reduce((sum, sample) => sum + timerCount(sample), 0) / last.length - first.reduce((sum, sample) => sum + timerCount(sample), 0) / first.length;
  await delay(500);
  assert.equal(failures, 0, `${failures} request checks failed`);
  if (seconds >= 60) assert.equal(Object.keys(coverage).length, 28, 'all four endpoints exercise all seven fault/success modes');
  assert.ok(growth.rss < 64 * 1024 * 1024 && growth.heap < 32 * 1024 * 1024, JSON.stringify(growth));
  assert.ok(growth.handles < 5 && timerGrowth < 5 && activeMockSockets <= 2, JSON.stringify({ growth, timerGrowth, activeMockSockets }));
  const result = { passed: true, elapsed_s: (Date.now() - started) / 1000, cycles, failures, growth, timerGrowth, activeMockSockets, samples: samples.length, coverage };
  console.log(JSON.stringify(result));
  const reportIndex = process.argv.indexOf('--report');
  const report = reportIndex >= 0 ? process.argv[reportIndex + 1] : process.env.SOAK_REPORT;
  if (report) { fs.mkdirSync(path.dirname(report), { recursive: true }); fs.writeFileSync(report, JSON.stringify(result, null, 2)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await exited;
  }
  for (const server of servers) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
  assert.ok(!child || child.exitCode !== null || child.signalCode !== null, 'test child exited');
  if (path.dirname(home) === path.resolve(os.tmpdir()) && path.basename(home).startsWith('oc-soak-')) fs.rmSync(home, { recursive: true, force: true });
});
