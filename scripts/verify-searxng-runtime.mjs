#!/usr/bin/env node
// Offline process checks for a staged SearXNG runtime. Boots it under the real
// headless-host, then requires: /healthz within 60 s, loopback-only listen, no
// window, and full teardown (closed port, no Python left) after the host is killed.
// Usage: verify-searxng-runtime.mjs <runtimeDir> <settingsPath> <headlessHost>
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [runtimeArg, settingsArg, hostArg] = process.argv.slice(2);
if (process.platform !== 'win32') {
  console.log('verify-searxng-runtime: skipped, Windows only');
  process.exit(0);
}
if (!runtimeArg || !settingsArg || !hostArg) {
  console.error('usage: verify-searxng-runtime.mjs <runtimeDir> <settingsPath> <headlessHost>');
  process.exit(2);
}

const runtimeDir = resolve(runtimeArg);
const settingsPath = resolve(settingsArg);
const host = resolve(hostArg);
const python = join(runtimeDir, 'python', 'python.exe');
for (const required of [python, settingsPath, host, join(runtimeDir, 'app', 'searx', 'webapp.py')]) {
  if (!existsSync(required)) {
    console.error(`verify-searxng-runtime: missing ${required}`);
    process.exit(1);
  }
}

const ps = command => spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).stdout.trim();
const pythonsUnder = () => {
  const out = ps(`@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${runtimeDir.replaceAll("'", "''")}', [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { "$($_.ProcessId)|$($_.ExecutablePath)" }) -join "\`n"`);
  return out.split(/\r?\n/).filter(line => line.includes('|')).map(line => {
    const [pid, path] = line.split('|');
    return { pid: Number(pid), path };
  });
};
const windowsOf = pid => Number(ps(`$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { $p.MainWindowHandle.ToInt64() } else { 0 }`) || 0);
const listeners = port => ps(`Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.LocalAddress }`)
  .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port: picked } = server.address();
    server.close(() => resolvePort(picked));
  });
});
const base = `http://127.0.0.1:${port}`;
const tmp = mkdtempSync(join(tmpdir(), 'searxng-verify-'));
const before = new Set(pythonsUnder().map(item => item.pid));
const env = {
  SYSTEMROOT: process.env.SYSTEMROOT,
  TEMP: tmp,
  TMP: tmp,
  SEARXNG_SETTINGS_PATH: settingsPath,
  SEARXNG_SECRET: randomBytes(32).toString('hex'),
  PYTHONUTF8: '1',
  PYTHONDONTWRITEBYTECODE: '1',
};
const args = ['--', python, '-m', 'granian', '--interface', 'wsgi', '--host', '127.0.0.1',
  '--port', String(port), '--workers', '1', 'searx.webapp:app'];
const proc = spawn(host, args, { env, cwd: join(runtimeDir, 'app'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let exited = false;
proc.once('exit', () => { exited = true; });
let log = '';
proc.stdout.on('data', chunk => { log += chunk; });
proc.stderr.on('data', chunk => { log += chunk; });

const startedPythons = () => pythonsUnder().filter(item => !before.has(item.pid));
const killStarted = () => {
  for (const item of startedPythons()) spawnSync('taskkill.exe', ['/F', '/PID', String(item.pid)], { windowsHide: true });
};

try {
  let ready = false;
  const deadline = Date.now() + 60_000;
  while (!ready && Date.now() < deadline) {
    try {
      ready = (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      // not listening yet
    }
    if (!ready) await new Promise(r => setTimeout(r, 500));
  }
  check(ready, `/healthz answered on ${base} within 60 s`);

  if (ready) {
    const addresses = listeners(port);
    check(addresses.length > 0 && addresses.every(address => address === '127.0.0.1'),
      `listen is loopback only (${addresses.join(', ') || 'none'})`);
    const pythons = startedPythons();
    check(pythons.length > 0, `Python process present under runtime (${pythons.length})`);
    for (const item of pythons) {
      const handle = windowsOf(item.pid);
      check(handle === 0, `python pid=${item.pid} has no window (handle ${handle})`);
    }
  }

  if (!exited) {
    proc.kill('SIGKILL');
  }
  await new Promise(r => setTimeout(r, 3000));
  let stillServing = false;
  try {
    stillServing = (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    // port closed, as expected
  }
  check(!stillServing, 'port closed after host kill');
  const left = startedPythons();
  check(left.length === 0, `no Python left under runtime after host kill (${left.length})`);
} finally {
  if (!exited) proc.kill('SIGKILL');
  killStarted();
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`verify-searxng-runtime: FAILED (${failures.length})`);
  process.exit(1);
}
console.log('verify-searxng-runtime: passed');
