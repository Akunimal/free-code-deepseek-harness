'use strict';

const net = require('net');
const http = require('http');
const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { prepareGatewayConfigs, atomicWriteJson } = require('./runtime-config');
const { validateInstalledConfig } = require('./config-validation');
const { prepareManualAvailability } = require('./manual-availability');
const { restartDelay, processDescriptor } = require('./supervisor-core');
const { captureProcessCreation } = require('./process-identity');
const { DEFAULT_MAX_BYTES, DEFAULT_MAX_FILES, rotateLogFile, appendLog } = require('./log-files');

const GATEWAY_HOME = path.resolve(process.env.OC_GATEWAY_HOME || path.resolve(__dirname, '..'));
const BIN_DIR = path.join(GATEWAY_HOME, 'bin');
const CONFIG_DIR = path.join(GATEWAY_HOME, 'config');
const DATA_DIR = path.join(GATEWAY_HOME, 'data');
const LOGS_DIR = path.join(GATEWAY_HOME, 'logs');
const SCRIPTS_DIR = path.join(GATEWAY_HOME, 'scripts');
const NODE_EXE = path.join(GATEWAY_HOME, 'runtime', 'node-v24.22.1', 'node.exe');

const O2A_EXE = process.env.OPENCODE2API_EXE || path.join(BIN_DIR, 'opencode2api.exe');
const O2A_CONFIG = path.join(DATA_DIR, 'pool-config.json');
const DIRECT_CONFIG = path.join(DATA_DIR, 'direct-config.json');
const DIRECT_PORT = parseInt(process.env.DIRECT_GATEWAY_PORT || '8084', 10);
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '8082', 10);
const PROXY_SCRIPT = path.join(SCRIPTS_DIR, 'proxy.js');
const SYNC_SCRIPT = path.join(SCRIPTS_DIR, 'sync-models.js');
const LOCAL_KEY_FILE = path.join(CONFIG_DIR, '.local-key');

const WEBUI_PORT = parseInt(process.env.WEBUI_PORT || '8081', 10);
const PROXY_STATS_PORT = parseInt(process.env.PROXY_PORT || '8080', 10);
const LOCK_PORT = parseInt(process.env.WATCHDOG_LOCK_PORT || '8089', 10);
const GRACEFUL_DRAIN_MS = 30_000;
const PROXY_SHUTDOWN_DRAIN_MS = 30_000;

const GATEWAY_LOG = path.join(LOGS_DIR, 'gateway.log');
const DIRECT_LOG = path.join(LOGS_DIR, 'direct-gateway.log');
const PROXY_LOG = path.join(LOGS_DIR, 'proxy.log');
const WATCHDOG_LOG = path.join(LOGS_DIR, 'watchdog.log');
const PID_FILE = path.join(DATA_DIR, 'supervised-pids.json');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'supervisor-heartbeat.json');
const MAINTENANCE_FILE = path.join(DATA_DIR, 'maintenance.json');

let lockServer = null;
let selfCreation = null;
let shuttingDown = false;
let shutdownPromise = null;
let preparedConfigs = null;
let lastConfigSignature = '';
let configErrorReported = false;
let healthCheckRunning = false;
let configRestartRunning = false;
let configRestartPending = false;
let configPreparationRunning = false;
const children = { gateway: null, direct: null, proxy: null };
const intentionalStops = new WeakSet();
const settledChildren = new WeakSet();
const MAX_LOG_SIZE = DEFAULT_MAX_BYTES;
const MAX_LOG_FILES = DEFAULT_MAX_FILES;
const CONFIG_ERROR_PATTERN = /configuration error|invalid configuration|config(?:uration)? (?:error|invalid)|配置错误|模型顺序包含/iu;
const restartState = Object.fromEntries(Object.keys(children).map(role => [role, {
  timer: null, fails: 0, lastStart: 0, starting: false, healthFailures: 0,
  configBlocked: false, restartAfterStop: false
}]));

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[watchdog ${ts}] ${msg}`;
  console.log(line);
  try {
    appendLog(WATCHDOG_LOG, line + '\n');
  } catch {}
}

class LogSink {
  constructor(filePath) {
    this.filePath = filePath;
  }
  write(chunk) {
    try { appendLog(this.filePath, chunk); }
    catch (error) { log(`Warning: log write failed for ${path.basename(this.filePath)}: ${error.message}`); }
  }
  reopen() {}
}

const logSinks = new Map();
function getLogSink(filePath) {
  if (!logSinks.has(filePath)) logSinks.set(filePath, new LogSink(filePath));
  return logSinks.get(filePath);
}

function rotateLog(filePath) {
  try {
    if (rotateLogFile(filePath, { maxBytes: MAX_LOG_SIZE, maxFiles: MAX_LOG_FILES })) {
      log(`Rotated log file with ${MAX_LOG_FILES}-file retention: ${path.basename(filePath)}`);
    }
  } catch (error) {
    log(`Warning during log rotation for ${filePath}: ${error.message}`);
  }
}

function rotateAllLogs() {
  for (const file of [GATEWAY_LOG, DIRECT_LOG, PROXY_LOG, WATCHDOG_LOG]) rotateLog(file);
}

function syncModels() {
  execFile(process.execPath, [SYNC_SCRIPT], {
    cwd: GATEWAY_HOME,
    env: { ...process.env, OC_GATEWAY_HOME: GATEWAY_HOME },
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 1024 * 1024
  }, (error, stdout, stderr) => {
    if (error) return log(`[models] sync failed: ${error.message}`);
    const message = `${stdout || ''}${stderr || ''}`.trim();
    if (/^Wrote/m.test(message)) log(`[models] ${message.split('\n')[0]}`);
  });
}

function processStartedAt() {
  return Date.now() - Math.floor(process.uptime() * 1000);
}

function describeChild(role, child) {
  if (!child || !child.pid) return null;
  const executable = child.spawnfile || (role === 'gateway' || role === 'direct' ? O2A_EXE : process.execPath);
  const args = Array.isArray(child.spawnargs) ? child.spawnargs.slice(1) : [];
  if (!child.__creation) {
    try { child.__creation = captureProcessCreation(child.pid, process.pid); }
    catch { return null; } // Never publish an estimated stamp as authority to kill.
  }
  return { ...processDescriptor(child.pid, path.resolve(executable), args, child.__startedAt || Date.now()), ...child.__creation };
}

function describeSupervisor() {
  return { ...processDescriptor(process.pid, path.resolve(process.execPath), process.argv.slice(1), processStartedAt()), ...selfCreation };
}

function writePidFile() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const snapshot = {
      version: 2,
      updatedAt: new Date().toISOString(),
      watchdog: describeSupervisor(),
      gateway: describeChild('gateway', children.gateway),
      direct: describeChild('direct', children.direct),
      proxy: describeChild('proxy', children.proxy)
    };
    atomicWriteJson(PID_FILE, snapshot);
  } catch (error) {
    log(`Warning: cannot write process identity state: ${error.message}`);
  }
}

function writeHeartbeat() {
  try {
    writePidFile();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    atomicWriteJson(HEARTBEAT_FILE, {
      version: 1,
      updatedAt: new Date().toISOString(),
      supervisor: describeSupervisor()
    });
  } catch (error) {
    log(`Warning: cannot write supervisor heartbeat: ${error.message}`);
  }
}

function readFileSignature(filePath) {
  try {
    const bytes = fs.readFileSync(filePath);
    return `${path.basename(filePath)}:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  } catch {
    return `${path.basename(filePath)}:missing`;
  }
}

function configSignature() {
  return [
    path.join(CONFIG_DIR, 'config.json'), O2A_CONFIG, DIRECT_CONFIG
  ].map(readFileSignature).join('|') + '|' + (() => {
    try { const stat = fs.statSync(O2A_EXE); return `${stat.size}:${stat.mtimeMs}`; } catch { return 'missing-executable'; }
  })();
}

async function prepareConfigsIfChanged(force = false) {
  if (configPreparationRunning || shuttingDown) return false;
  const before = configSignature();
  if (!force && before === lastConfigSignature) return false;
  configPreparationRunning = true;
  const previousPrepared = preparedConfigs;
  const previousRuntimeSignature = [O2A_CONFIG, DIRECT_CONFIG].map(readFileSignature).join('|');
  const sourceChangedAtRuntime = Boolean(previousPrepared && lastConfigSignature && before !== lastConfigSignature);
  try {
    preparedConfigs = await prepareGatewayConfigs(GATEWAY_HOME, { poolPort: GATEWAY_PORT, directPort: DIRECT_PORT,
      validateCandidate: config => validateInstalledConfig(O2A_EXE, config) });
    if (shuttingDown) return false;
    const catalogs = [path.join(CONFIG_DIR, 'config.json.models.catalog.json'), path.join(DATA_DIR, 'models.catalog.generated.json'),
      `${O2A_CONFIG}.models.catalog.json`, `${DIRECT_CONFIG}.models.catalog.json`];
    for (const file of [O2A_CONFIG, DIRECT_CONFIG]) {
      prepareManualAvailability(file, JSON.parse(fs.readFileSync(file, 'utf8')), catalogs);
    }
    lastConfigSignature = configSignature();
    configErrorReported = false;
    for (const role of ['gateway', 'direct']) {
      restartState[role].configBlocked = false;
      restartState[role].restartAfterStop = false;
      restartState[role].fails = 0;
    }
    log(`Prepared validated configs (pool=${path.basename(preparedConfigs.poolPath)}, direct=${path.basename(preparedConfigs.directPath)}, recovered=${preparedConfigs.recovered}).`);
    const runtimeSignature = [O2A_CONFIG, DIRECT_CONFIG].map(readFileSignature).join('|');
    if (sourceChangedAtRuntime && previousRuntimeSignature !== runtimeSignature && (children.gateway || children.direct || children.proxy)) {
      void restartForConfigChange();
    } else {
      startRole('gateway');
      startRole('direct');
    }
    return true;
  } catch (error) {
    preparedConfigs = previousPrepared;
    lastConfigSignature = before;
    if (!previousPrepared) {
      for (const role of ['gateway', 'direct']) restartState[role].configBlocked = true;
      if (!configErrorReported) log(`[CONFIG BLOCKED] ${error.message}; waiting for a config file change.`);
    } else if (!configErrorReported) {
      log(`[CONFIG REJECTED] ${error.message}; keeping the previously validated runtime config active.`);
    }
    configErrorReported = true;
    return false;
  } finally {
    configPreparationRunning = false;
  }
}

async function waitForRoleLiveness(role, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (!shuttingDown && Date.now() < deadline) {
    const child = children[role];
    if (child && child.exitCode === null && child.signalCode === null) {
      try { if (await roleSpec[role].probe()) return true; } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

async function restartForConfigChange() {
  if (shuttingDown) return;
  if (configRestartRunning) { configRestartPending = true; return; }
  configRestartRunning = true;
  log('Validated runtime config changed; draining ingress before replacing both gateway processes.');
  try {
    for (const role of ['proxy', 'gateway', 'direct']) {
      if (restartState[role].timer) clearTimeout(restartState[role].timer);
      restartState[role].timer = null;
      restartState[role].starting = false;
    }
    await stopChild(children.proxy, 'proxy');
    await Promise.all([
      stopChild(children.gateway, 'gateway'),
      stopChild(children.direct, 'direct')
    ]);
    startRole('gateway');
    startRole('direct');
    const [poolAlive, directAlive] = await Promise.all([
      waitForRoleLiveness('gateway'),
      waitForRoleLiveness('direct')
    ]);
    if (!poolAlive || !directAlive) {
      log(`[CONFIG APPLY] local gateway liveness after restart: pool=${poolAlive}, direct=${directAlive}; ingress will still return honest local errors.`);
    }
    startRole('proxy');
  } finally {
    configRestartRunning = false;
    if (configRestartPending && !shuttingDown) {
      configRestartPending = false;
      setImmediate(() => { void restartForConfigChange(); });
    }
  }
}

function portIsOpen(port, timeoutMs = 500) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = open => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function httpLiveness(port, requestPath) {
  return new Promise(resolve => {
    let settled = false;
    let hardTimer;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      request.destroy();
      resolve(value);
    };
    const request = http.request({ host: '127.0.0.1', port, path: requestPath, method: 'GET', timeout: 1800 }, response => {
      response.resume();
      response.once('end', () => finish(true));
      response.once('error', () => finish(false));
    });
    hardTimer = setTimeout(() => finish(false), 2200);
    request.once('timeout', () => finish(false));
    request.once('error', () => finish(false));
    request.end();
  });
}


const roleSpec = {
  gateway: { port: GATEWAY_PORT, probe: () => httpLiveness(GATEWAY_PORT, '/__gateway_livez') },
  direct: { port: DIRECT_PORT, probe: () => httpLiveness(DIRECT_PORT, '/__gateway_livez') },
  proxy: { port: PROXY_STATS_PORT, probe: () => httpLiveness(PROXY_STATS_PORT, '/livez') }
};

function roleEnvironment(role) {
  const env = { ...process.env, OC_GATEWAY_HOME: GATEWAY_HOME };
  if (role === 'gateway') {
    env.OC_CLOUDFLARE_RELAY_CONFIG = path.join(GATEWAY_HOME, 'data', 'cloudflare-relay.json');
    env.OC_VERCEL_RELAY_CONFIG = path.join(GATEWAY_HOME, 'data', 'vercel-relay.json');
  }
  if (role === 'proxy') {
    env.WEBUI_PORT = String(WEBUI_PORT);
    env.PROXY_PORT = String(PROXY_STATS_PORT);
    env.GATEWAY_PORT = String(GATEWAY_PORT);
    env.DIRECT_GATEWAY_PORT = String(DIRECT_PORT);
    env.PROXY_SHUTDOWN_DRAIN_MS = String(PROXY_SHUTDOWN_DRAIN_MS);
  }
  return env;
}

function scheduleRestart(role, note = 'child exited') {
  const state = restartState[role];
  if (shuttingDown || state.timer || state.configBlocked) return 0;
  if (Date.now() - state.lastStart >= 30_000) state.fails = 0;
  const delay = restartDelay(state.fails++);
  state.timer = setTimeout(() => {
    state.timer = null;
    startRole(role);
  }, delay);
  log(`[RESTART SCHEDULED] ${role}: ${note}; retry in ${delay}ms.`);
  return delay;
}

function markPermanentConfigFailure(role, errorText) {
  const state = restartState[role];
  state.configBlocked = true;
  lastConfigSignature = configSignature();
  preparedConfigs = null;
  for (const gatewayRole of ['gateway', 'direct']) {
    restartState[gatewayRole].configBlocked = true;
    restartState[gatewayRole].restartAfterStop = false;
  }
  log(`[CONFIG BLOCKED] ${role}: ${errorText.trim()}; no restart loop until config changes.`);
  const child = children[role];
  if (child && child.exitCode === null) {
    intentionalStops.add(child);
    try { child.kill(); } catch {}
  }
}

function settleChild(role, child, reason) {
  if (settledChildren.has(child)) return;
  settledChildren.add(child);
  if (children[role] === child) children[role] = null;
  restartState[role].starting = false;
  restartState[role].healthFailures = 0;
  writePidFile();
  if (intentionalStops.has(child)) {
    intentionalStops.delete(child);
    if (restartState[role].restartAfterStop && !shuttingDown && !restartState[role].configBlocked) {
      restartState[role].restartAfterStop = false;
      scheduleRestart(role, 'local liveness probe failed');
    }
    return;
  }
  if (shuttingDown) return;
  log(`[PROCESS EXIT] ${role}: ${reason}.`);
  scheduleRestart(role, reason);
}

function spawnRole(role, executable, args, logPath, extraEnv = {}) {
  if (shuttingDown) return;
  const state = restartState[role];
  let child;
  const startedAt = Date.now();
  try {
    child = spawn(executable, args, {
      cwd: GATEWAY_HOME,
      env: { ...roleEnvironment(role), ...extraEnv },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    state.starting = false;
    log(`[SPAWN ERROR] ${role}: ${error.message}`);
    scheduleRestart(role, `spawn error: ${error.message}`);
    return;
  }

  child.__startedAt = startedAt;
  children[role] = child;
  state.lastStart = startedAt;
  state.starting = false;
  state.healthFailures = 0;
  writePidFile();
  const output = getLogSink(logPath);
  let outputTail = '';
  const handleData = chunk => {
    output.write(chunk);
    const text = outputTail + chunk.toString('utf8');
    outputTail = text.slice(-512);
    if (/"event"\s*:\s*"server_started"/.test(text)) child.__startedServing = true;
    if (!child.__startedServing && (role === 'gateway' || role === 'direct') && CONFIG_ERROR_PATTERN.test(text)) {
      markPermanentConfigFailure(role, text);
    }
  };
  if (child.stdout) child.stdout.on('data', handleData);
  if (child.stderr) child.stderr.on('data', handleData);
  child.once('error', error => settleChild(role, child, `spawn error ${error.code || ''}: ${error.message}`));
  child.once('exit', (code, signal) => settleChild(role, child, `code=${code}, signal=${signal}`));
}

function startRole(role, waitAttempt = 0) {
  const state = restartState[role];
  if (shuttingDown || state.timer || state.starting || children[role] || state.configBlocked) return;
  if ((role === 'gateway' || role === 'direct') && !preparedConfigs) {
    state.configBlocked = true;
    return;
  }
  state.starting = true;
  const { port } = roleSpec[role];
  portIsOpen(port, 350).then(busy => {
    if (shuttingDown) { state.starting = false; return; }
    if (busy) {
      state.starting = false;
      if (waitAttempt < 20) {
        if (waitAttempt === 0) log(`Port ${port} is occupied; waiting for ${role} to bind safely.`);
        setTimeout(() => startRoleAfterPortWait(role, waitAttempt + 1), 500);
      } else {
        scheduleRestart(role, `port ${port} stayed occupied`);
      }
      return;
    }
    if (role === 'gateway') {
      log(`Starting opencode2api Cloudflare backend on :${GATEWAY_PORT}...`);
      spawnRole(role, O2A_EXE, ['-config', O2A_CONFIG, '-listen', `127.0.0.1:${GATEWAY_PORT}`], GATEWAY_LOG);
    } else if (role === 'direct') {
      log(`Starting opencode2api direct gateway on :${DIRECT_PORT}...`);
      spawnRole(role, O2A_EXE, ['-config', DIRECT_CONFIG, '-listen', `127.0.0.1:${DIRECT_PORT}`], DIRECT_LOG);
    } else if (role === 'proxy') {
      log(`Starting ingress proxy on :${PROXY_STATS_PORT}...`);
      spawnRole(role, process.execPath, [PROXY_SCRIPT], PROXY_LOG);
    }
  }).catch(error => {
    state.starting = false;
    scheduleRestart(role, `port probe failed: ${error.message}`);
  });
}

function startRoleAfterPortWait(role, attempt) {
  if (shuttingDown || children[role] || restartState[role].timer || restartState[role].configBlocked) return;
  startRole(role, attempt);
}

function checkPort(port, timeout = 1500) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

function buildDirectConfig(config) {
  return {
    ...config,
    listen: `127.0.0.1:${DIRECT_PORT}`,
    proxies: ['direct'],
    proxyfile: '',
    webui: { ...config.webui, enabled: false }
  };
}

async function requestProxyShutdown() {
  return new Promise(resolve => {
    let key = '';
    try { key = fs.readFileSync(LOCAL_KEY_FILE, 'utf8').trim(); } catch {}
    const headers = { 'Content-Length': 0 };
    if (key) headers.Authorization = `Bearer ${key}`;
    const request = http.request({
      host: '127.0.0.1', port: PROXY_STATS_PORT, path: '/shutdown', method: 'POST', headers,
      timeout: 2500
    }, response => { response.resume(); response.once('end', () => resolve(true)); });
    request.once('error', () => resolve(false));
    request.once('timeout', () => { request.destroy(); resolve(false); });
    request.end();
  });
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
  });
}

async function stopChild(child, role) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  restartState[role].restartAfterStop = false;
  intentionalStops.add(child);
  if (role === 'proxy') {
    log(`Asking ingress to drain for up to ${GRACEFUL_DRAIN_MS}ms before shutdown.`);
    await requestProxyShutdown();
    if (await waitForExit(child, GRACEFUL_DRAIN_MS + 1000)) return;
  } else {
    try { child.kill(); } catch {}
    if (await waitForExit(child, 3000)) return;
  }
  log(`Owned ${role} process did not exit on schedule; terminating its child handle.`);
  try { child.kill(); } catch {}
  await waitForExit(child, 2000);
}

function maintenanceActive() {
  return fs.existsSync(MAINTENANCE_FILE);
}

function monitorMaintenance() {
  if (maintenanceActive()) void shutdown('maintenance mode');
}

async function runHealthChecks() {
  if (healthCheckRunning || configRestartRunning || shuttingDown) return;
  healthCheckRunning = true;
  try {
    for (const role of Object.keys(children)) {
      const child = children[role];
      const state = restartState[role];
      if (!child || child.exitCode !== null || Date.now() - state.lastStart < 25_000) continue;
      let alive = false;
      try { alive = await roleSpec[role].probe(); } catch {}
      if (alive) {
        state.healthFailures = 0;
        if (Date.now() - state.lastStart > 60_000) state.fails = 0;
        continue;
      }
      state.healthFailures++;
      log(`[LIVENESS] ${role} failed local probe ${state.healthFailures}/2.`);
      if (state.healthFailures >= 2) {
        state.healthFailures = 0;
        log(`[LIVENESS] Restarting unresponsive ${role}; provider availability is not part of this probe.`);
        state.restartAfterStop = true;
        intentionalStops.add(child);
        try { child.kill(); } catch {}
      }
    }
  } finally {
    healthCheckRunning = false;
  }
}

async function shutdown(reason) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    log(`Watchdog shutting down (${reason}); stopping supervised children.`);
    for (const state of Object.values(restartState)) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    }
    await stopChild(children.proxy, 'proxy');
    for (const role of ['gateway', 'direct']) await stopChild(children[role], role);
    for (const role of Object.keys(children)) children[role] = null;
    writePidFile();
    try { if (fs.existsSync(HEARTBEAT_FILE)) fs.unlinkSync(HEARTBEAT_FILE); } catch {}
    try { if (lockServer) lockServer.close(); } catch {}
    setTimeout(() => process.exit(0), 10).unref();
  })();
  return shutdownPromise;
}

async function acquireLock() {
  return new Promise(resolve => {
    const server = net.createServer(socket => socket.destroy());
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') {
        log(`Lock port ${LOCK_PORT} is held by another supervisor; this instance will exit.`);
        resolve(false);
      } else {
        log(`Cannot acquire supervisor lock on :${LOCK_PORT}: ${error.message}`);
        resolve(false);
      }
    });
    server.listen(LOCK_PORT, '127.0.0.1', () => {
      lockServer = server;
      resolve(true);
    });
  });
}

function validatePrivateRuntime() {
  const expected = path.resolve(NODE_EXE).toLowerCase();
  const actual = path.resolve(process.execPath).toLowerCase();
  if (actual !== expected || process.version !== 'v24.22.1') {
    throw new Error(`Supervisor requires pinned ${NODE_EXE} v24.22.1; running ${process.execPath} ${process.version}`);
  }
}

async function main() {
  try { validatePrivateRuntime(); } catch (error) { log(`[RUNTIME BLOCKED] ${error.message}`); process.exitCode = 1; return; }
  if (!await acquireLock()) return;
  try { selfCreation = captureProcessCreation(process.pid); }
  catch (error) {
    log(`[IDENTITY BLOCKED] Cannot verify supervisor creation: ${error.message}`);
    lockServer.close(); process.exitCode = 1; return;
  }
  process.on('uncaughtException', error => {
    log(`[UNCAUGHT] ${error.stack || error.message}`);
    void shutdown('uncaught exception');
  });
  process.on('unhandledRejection', reason => log(`[UNHANDLED REJECTION] ${reason}`));

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(signal, () => { void shutdown(signal); });
  }
  log(`Pinned Node supervisor active in ${GATEWAY_HOME}.`);
  writePidFile();
  writeHeartbeat();
  await prepareConfigsIfChanged(true);

  startRole('proxy');
  startRole('gateway');
  startRole('direct');

  setInterval(writeHeartbeat, 5000).unref();
  setInterval(monitorMaintenance, 1000).unref();
  setInterval(() => prepareConfigsIfChanged(false), 5000).unref();
  setInterval(runHealthChecks, 10_000).unref();
  setInterval(rotateAllLogs, 5 * 60 * 1000).unref();
  setTimeout(syncModels, 5000).unref();
  setInterval(syncModels, 30 * 60 * 1000).unref();
  process.on('exit', () => {
    try { if (fs.existsSync(HEARTBEAT_FILE)) fs.unlinkSync(HEARTBEAT_FILE); } catch {}
  });
  log(`Supervising ingress :${PROXY_STATS_PORT}, Cloudflare backend :${GATEWAY_PORT} and direct :${DIRECT_PORT}.`);
}

if (require.main === module) void main();
module.exports = {
  LogSink,
  getLogSink,
  rotateLog,
  MAX_LOG_SIZE,
  MAX_LOG_FILES,
  buildDirectConfig,
  restartDelay,
  roleSpec,
  processDescriptor,
  configSignature
};
