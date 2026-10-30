'use strict';

// Owns a temporary five-process stack. Never discovers or terminates live services.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-supervisor-'));
const stateFile = path.join(home, 'data', 'supervised-pids.json');
const heartbeatFile = path.join(home, 'data', 'supervisor-heartbeat.json');
const roles = ['proxy', 'gateway', 'direct'];
let supervisor;
let env;
let output = '';
let egressGuard;
const guardSockets = new Set();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function state() { try { return JSON.parse(fs.readFileSync(stateFile)); } catch { return {}; } }
async function until(predicate, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await predicate()) return Date.now() - started; await delay(200); }
  throw new Error(`integration timeout: ${output.slice(-6000)}`);
}
function powershell(code) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ProgressPreference='SilentlyContinue';" + code, 'utf16le').toString('base64')], { windowsHide: true, env, encoding: 'utf8', timeout: 30000 });
}
function killOwned(identity) {
  if (!identity) return;
  assert.ok(identity.executable.toLowerCase().startsWith(home.toLowerCase() + path.sep));
  const encoded = Buffer.from(JSON.stringify(identity)).toString('base64');
  powershell(`$ErrorActionPreference='Stop'; $identity=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json; $cim=Get-CimInstance Win32_Process -Filter "ProcessId = $($identity.pid)"; if(!$cim){exit 0}; if($cim.ExecutablePath -ine $identity.executable){throw 'executable mismatch'}; foreach($arg in $identity.args){if($cim.CommandLine.IndexOf([string]$arg,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'argument mismatch'}}; $process=Get-Process -Id $identity.pid; if([Math]::Abs(($process.StartTime.ToUniversalTime()-[DateTimeOffset]::Parse($identity.startedAt).UtcDateTime).TotalMilliseconds) -gt 8000){throw 'creation mismatch'}; $process.Kill(); [void]$process.WaitForExit(5000)`);
}
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function get(port, url) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: url, timeout: 1000, agent: false }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }); } catch { resolve({ status: res.statusCode }); } });
    });
    req.on('error', () => resolve({ status: 0 }));
    req.on('timeout', () => req.destroy());
  });
}
async function main() {
  for (const folder of ['scripts', 'config', 'data', 'bin', 'runtime/node-v24.22.1']) fs.mkdirSync(path.join(home, folder), { recursive: true });
  for (const file of fs.readdirSync(__dirname).filter(file => /\.(js|ps1)$/.test(file))) fs.copyFileSync(path.join(__dirname, file), path.join(home, 'scripts', file));
  for (const relative of ['runtime/node-v24.22.1/node.exe', 'bin/opencode2api.exe']) {
    try { fs.linkSync(path.join(root, relative), path.join(home, relative)); }
    catch { fs.copyFileSync(path.join(root, relative), path.join(home, relative)); }
  }
  const ports = [];
  while (ports.length < 6) { const port = await freePort(); if (!ports.includes(port)) ports.push(port); }
  const [proxy, gateway, direct, rotator, front, lock] = ports;
  egressGuard = http.createServer((req, res) => { req.resume(); res.writeHead(502).end(); });
  egressGuard.on('connect', (req, socket) => socket.end('HTTP/1.1 502 blocked by isolated test\r\nConnection: close\r\n\r\n'));
  egressGuard.on('connection', socket => { guardSockets.add(socket); socket.on('error', () => {}); socket.once('close', () => guardSockets.delete(socket)); });
  await new Promise(resolve => egressGuard.listen(0, '127.0.0.1', resolve));
  const guardPort = egressGuard.address().port;
  // Only the fixture's direct egress transport changes: block every network target.
  // Process ownership, lifecycle, generated config and both installed binaries are real.
  const runtimeConfigPath = path.join(home, 'scripts', 'runtime-config.js');
  const runtimeConfig = fs.readFileSync(runtimeConfigPath, 'utf8');
  assert.ok(runtimeConfig.includes("config.proxies = ['direct'];"));
  fs.writeFileSync(runtimeConfigPath, runtimeConfig.replaceAll("config.proxies = ['direct'];", `config.proxies = ['http://127.0.0.1:${guardPort}'];`).replaceAll("poolConfig.proxies = ['direct'];", `poolConfig.proxies = ['http://127.0.0.1:${guardPort}'];`));
  env = { ...process.env, OC_GATEWAY_HOME: home, PROXY_PORT: String(proxy), GATEWAY_PORT: String(gateway), DIRECT_GATEWAY_PORT: String(direct), ROTATOR_PORT: String(rotator), POOL_FRONT_PORT: String(front), WATCHDOG_LOCK_PORT: String(lock) };
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'config.example.json')));
  config.server_keys = ['isolated-integration']; config.zen_keys = ['isolated-upstream-key']; config.go_keys = []; config.anonymous = false;
  config.upstream = { zen: `http://127.0.0.1:${lock}/v1`, go: `http://127.0.0.1:${lock}/v1` };
  config.logging = { ...config.logging, ring_size: 100, dump_request_bodies: false };
  fs.writeFileSync(path.join(home, 'config', 'config.json'), JSON.stringify(config));
  // These mock only harvesting/status; the supervisor, ingress, front and both installed Go processes are real.
  fs.writeFileSync(path.join(home, 'scripts', 'proxy-rotator.js'), `require('http').createServer((q,s)=>s.end(JSON.stringify({pool_size:0,generation_confirmed:false}))).listen(Number(process.env.ROTATOR_PORT),'127.0.0.1')`);
  fs.writeFileSync(path.join(home, 'scripts', 'sync-models.js'), '// disabled in isolated integration');
  const proxyFile = path.join(home, 'scripts', 'proxy.js');
  fs.writeFileSync(proxyFile, `setInterval(()=>{const p=require('path').join(process.env.OC_GATEWAY_HOME,'hang-proxy');if(require('fs').existsSync(p)){require('fs').unlinkSync(p);while(true){}}},200).unref();\n` + fs.readFileSync(proxyFile, 'utf8'));
  const watchdogFile = path.join(home, 'scripts', 'watchdog.js');
  fs.writeFileSync(watchdogFile, `setInterval(()=>{const p=require('path').join(process.env.OC_GATEWAY_HOME,'hang-watchdog');if(require('fs').existsSync(p)){require('fs').unlinkSync(p);while(true){}}},200).unref();\n` + fs.readFileSync(watchdogFile, 'utf8'));
  fs.appendFileSync(watchdogFile, `\nsetInterval(()=>{const p=path.join(GATEWAY_HOME,'provider-config-log');if(fs.existsSync(p)&&children.gateway){fs.unlinkSync(p);children.gateway.stdout.emit('data',Buffer.from('{"event":"upstream_error","message":"configuration error"}\\n'));}},200).unref();\n`);
  const blocker = net.createServer(socket => socket.destroy());
  await new Promise(resolve => blocker.listen(proxy, '127.0.0.1', resolve));
  const binary = path.join(home, 'bin', 'opencode2api.exe');
  fs.renameSync(binary, binary + '.missing');
  const node = path.join(home, 'runtime', 'node-v24.22.1', 'node.exe');
  supervisor = spawn(node, [path.join(home, 'scripts', 'watchdog.js')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [supervisor.stdout, supervisor.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-12000); });
  await until(() => output.includes('validator unavailable (ENOENT)'));
  assert.equal(state().proxy, null, 'occupied port never authorizes a duplicate ingress');
  fs.renameSync(binary + '.missing', binary);
  await new Promise(resolve => blocker.close(resolve));
  await until(() => roles.every(role => state()[role]?.pid));
  await until(async () => (await get(proxy, '/readyz')).body?.ready);
  assert.equal(state().rotator, undefined);
  assert.equal(state().poolFront, undefined);
  console.log('PASS network-confined three-process stack starts with no rotator or SOCKS roles');
  console.log('PASS missing executable and occupied port recover without killing the port owner');
  const beforeProviderLog = Object.fromEntries(roles.map(role => [role, state()[role].pid]));
  fs.writeFileSync(path.join(home, 'provider-config-log'), 'emit once');
  await until(() => !fs.existsSync(path.join(home, 'provider-config-log')));
  await delay(5500);
  assert.deepEqual(Object.fromEntries(roles.map(role => [role, state()[role].pid])), beforeProviderLog);
  console.log('PASS provider configuration-error text after startup never blocks or restarts local processes');
  for (const role of roles) {
    const before = state()[role];
    killOwned(before);
    const elapsed = await until(() => state()[role]?.pid && state()[role].pid !== before.pid);
    console.log(`PASS isolated ${role} recovery ${elapsed}ms`);
  }
  await delay(1000);
  const hung = state().proxy;
  fs.writeFileSync(path.join(home, 'hang-proxy'), 'hang once');
  const hungElapsed = await until(() => state().proxy?.pid && state().proxy.pid !== hung.pid, 75000);
  console.log(`PASS local event-loop hang recovered ${hungElapsed}ms`);
  const hungSupervisor = state().watchdog;
  fs.writeFileSync(path.join(home, 'hang-watchdog'), 'hang once');
  await delay(26000);
  powershell(`& '${path.join(home, 'scripts', 'launch-gateway.ps1')}' -GatewayHome '${home}' -StartupGraceSeconds 0`);
  await until(() => state().watchdog?.pid && state().watchdog.pid !== hungSupervisor.pid && roles.every(role => state()[role]?.pid));
  console.log('PASS stale-heartbeat supervisor hang recovered by independent launcher');
  const previous = state();
  killOwned(previous.watchdog);
  const elapsed = Date.now();
  powershell(`& '${path.join(home, 'scripts', 'launch-gateway.ps1').replaceAll("'", "''")}' -GatewayHome '${home.replaceAll("'", "''")}' -StartupGraceSeconds 0`);
  await until(() => state().watchdog?.pid && state().watchdog.pid !== previous.watchdog.pid && roles.every(role => state()[role]?.pid), 40000);
  assert.ok(Date.now() - elapsed <= 90000);
  console.log(`PASS independent launcher reclaims verified orphan children and supervisor ${Date.now() - elapsed}ms`);
  // Simulated loss of the whole owned tree; no live process discovery.
  const tree = state();
  for (const role of [...roles, 'watchdog']) killOwned(tree[role]);
  powershell(`& '${path.join(home, 'scripts', 'launch-gateway.ps1').replaceAll("'", "''")}' -GatewayHome '${home.replaceAll("'", "''")}' -StartupGraceSeconds 0`);
  await until(() => state().watchdog?.pid && state().watchdog.pid !== tree.watchdog.pid && roles.every(role => state()[role]?.pid), 40000);
  console.log('PASS whole isolated process tree recovers');
  fs.writeFileSync(path.join(home, 'data', 'maintenance.json'), '{"version":1}');
  await until(() => !fs.existsSync(heartbeatFile), 35000);
  const decision = powershell(`& '${path.join(home, 'scripts', 'launch-gateway.ps1')}' -GatewayHome '${home}' -CheckOnly`);
  assert.match(decision, /maintenance/);
  console.log('PASS deliberate maintenance drains and suppresses independent recovery');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  fs.mkdirSync(path.join(home, 'data'), { recursive: true });
  fs.writeFileSync(path.join(home, 'data', 'maintenance.json'), '{"version":1}');
  const owned = state();
  for (const role of [...roles, 'watchdog']) { try { killOwned(owned[role]); } catch (error) { console.error(error.message); process.exitCode = 1; } }
  if (supervisor && supervisor.exitCode === null && supervisor.signalCode === null) { supervisor.kill(); await delay(500); }
  for (const socket of guardSockets) socket.destroy();
  if (egressGuard) await new Promise(resolve => egressGuard.close(resolve));
  if (path.dirname(home) === path.resolve(os.tmpdir()) && path.basename(home).startsWith('oc-supervisor-')) fs.rmSync(home, { recursive: true, force: true });
});
