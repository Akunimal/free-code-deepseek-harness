'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { normalizePoolConfig } = require('./runtime-config');
const { prepareManualAvailability } = require('./manual-availability');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-manual-probes-'));
  const sockets = new Set();
  let posts = 0;
  let child;
  const guard = http.createServer((req, res) => {
    if (req.method === 'POST') posts++;
    req.resume(); res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'mimo-v2.6-flash-free' }] }));
  });
  guard.on('connect', (_req, socket) => socket.end('HTTP/1.1 502 Blocked\r\n\r\n'));
  guard.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); });
  try {
    await new Promise(resolve => guard.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${guard.address().port}`;
    const config = normalizePoolConfig({ server_keys: ['isolated-key'], zen_keys: ['isolated-provider-key'], anonymous: false,
      upstream: { zen: origin, go: origin }, models: { protocols: { 'mimo-v2.6-flash-free': 'chat' } } });
    config.proxies = [origin]; config.listen = '127.0.0.1:0';
    const configPath = path.join(home, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const catalogPath = path.resolve(__dirname, '../data/pool-config.json.models.catalog.json');
    const prepared = prepareManualAvailability(configPath, config, [catalogPath]);
    let records = JSON.parse(fs.readFileSync(prepared.file));
    assert.ok(Object.values(records).every(item => item.manual && !item.disabled));
    records['mimo-v2.6-flash-free'].disabled = true;
    fs.writeFileSync(prepared.file, JSON.stringify(records));
    prepareManualAvailability(configPath, config, [catalogPath]);
    let output = '';
    child = spawn(process.env.OPENCODE2API_EXE || path.resolve(__dirname, '../bin/opencode2api.exe'), ['-config', configPath, '-listen', config.listen], { cwd: home, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', error => { output += error.message; });
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    const until = Date.now() + 5000;
    while (!output.includes('server_started') && Date.now() < until && child.exitCode === null) await wait(25);
    assert.ok(output.includes('server_started'), output);
    await wait(1500);
    assert.equal(posts, 0, 'installed executable must not generate background inference for known models');
    assert.ok(!output.includes('availability_checked'), output);
    console.log(`PASS installed Go starts with ${prepared.models} manual models, no disabled records and zero background inference POSTs`);
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    for (const socket of sockets) socket.destroy();
    if (guard.listening) await new Promise(resolve => guard.close(resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
