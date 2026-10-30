'use strict';
// Measures the real 120s public deadline against silent local backends.
const assert = require('assert/strict');
const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-deadline-'));
const servers = [];
let child;
let attempts = 0;
let active = 0;
let peak = 0;
const payload = JSON.stringify({ model: 'strict-deadline-model', stream: true, messages: [{ role: 'user', content: 'local mock only' }] });
async function listen(server) {
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function main() {
  fs.mkdirSync(path.join(home, 'config'));
  fs.writeFileSync(path.join(home, 'config', 'config.json'), '{}');
  const backend = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      assert.equal(Buffer.concat(chunks).toString(), payload);
      attempts++; active++; peak = Math.max(peak, active);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const timer = setInterval(() => res.write(': keepalive\n\n'), 100);
      res.once('close', () => { active--; clearInterval(timer); });
    });
  });
  const backendPort = await listen(backend);
  const reservation = net.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  child = spawn(process.execPath, [path.join(__dirname, 'proxy.js')], { windowsHide: true, stdio: 'ignore', env: {
    ...process.env, OC_GATEWAY_HOME: home, PROXY_PORT: String(port), GATEWAY_PORT: String(backendPort), DIRECT_GATEWAY_PORT: String(backendPort), FIRST_CONTENT_BUDGET_MS: '120000', POOL_FIRST_EVENT_TIMEOUT_MS: '40000'
  } });
  await new Promise(resolve => setTimeout(resolve, 500));
  const started = Date.now();
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/chat/completions', timeout: 124000, agent: false }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode)); res.on('error', reject);
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('public deadline not enforced'))); req.end(payload);
  });
  const elapsed = Date.now() - started;
  assert.equal(status, 504);
  assert.ok(elapsed >= 118000 && elapsed <= 122000, `elapsed=${elapsed}`);
  assert.ok(attempts <= 4 && peak === 1, `attempts=${attempts} peak=${peak}`);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(active, 0, 'all backend work cancelled');
  console.log(`PASS real 120s deadline: ${elapsed}ms, status=${status}, attempts=${attempts}, peak=${peak}, active=${active}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
  for (const server of servers) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
  if (path.dirname(home) === path.resolve(os.tmpdir()) && path.basename(home).startsWith('oc-deadline-')) fs.rmSync(home, { recursive: true, force: true });
});
