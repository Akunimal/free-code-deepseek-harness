'use strict';

// Validate the installed executable, not a possibly different source checkout.
// The candidate retains schema fields; only network destinations are confined.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

async function validateInstalledConfig(binary, candidate) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-config-validation-'));
  const sockets = new Set();
  const guard = http.createServer((req, res) => res.writeHead(502, { Connection: 'close' }).end());
  guard.on('connect', (_req, socket) => socket.end('HTTP/1.1 502 Blocked\r\nConnection: close\r\n\r\n'));
  guard.on('connection', socket => {
    sockets.add(socket); socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
  });
  let child;
  try {
    await new Promise((resolve, reject) => { guard.once('error', reject); guard.listen(0, '127.0.0.1', resolve); });
    const reservation = net.createServer();
    await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    const apiPort = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const config = structuredClone(candidate);
    config.listen = `127.0.0.1:${apiPort}`;
    config.proxies = [`http://127.0.0.1:${guard.address().port}`];
    config.proxyfile = '';
    config.upstream = Object.fromEntries(Object.keys(config.upstream || {}).map(key => [key, `http://127.0.0.1:${guard.address().port}`]));
    config.webui = { ...config.webui, enabled: false, listen: '127.0.0.1:0' };
    const configPath = path.join(home, 'candidate.json');
    fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
    await new Promise((resolve, reject) => {
      let settled = false;
      let tail = '';
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(() => finish(new Error('installed configuration validation timed out')), 5000);
      child = spawn(binary, ['-config', configPath, '-listen', config.listen], {
        cwd: home, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
      const observe = chunk => {
        tail = (tail + chunk.toString('utf8')).slice(-16384);
        if (/"event"\s*:\s*"server_started"/.test(tail)) finish();
      };
      child.stdout.on('data', observe); child.stderr.on('data', observe);
      child.once('error', error => finish(new Error(`installed configuration validator unavailable (${error.code || 'spawn'})`)));
      child.once('exit', code => finish(new Error(`installed executable rejected candidate configuration (exit ${code})`)));
    });
  } finally {
    if (child && child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
    for (const socket of sockets) socket.destroy();
    if (guard.listening) await new Promise(resolve => guard.close(resolve));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

module.exports = { validateInstalledConfig };
