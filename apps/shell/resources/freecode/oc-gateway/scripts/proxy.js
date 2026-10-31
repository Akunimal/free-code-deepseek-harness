const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ChatCoordinator } = require('./chat-coordinator');
const { executeGatewayAttempt } = require('./chat-upstream');
const { appendLog } = require('./log-files');
const { atomicWriteJson, firstEnabledServerKey } = require('./runtime-config');
const { sanitizeMimoPayload, resolveSessionId } = require('./mimo-sanitizer');

// Central Directory Resolution via OC_GATEWAY_HOME
const GATEWAY_HOME = process.env.OC_GATEWAY_HOME || path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(GATEWAY_HOME, 'config');
const DATA_DIR = path.join(GATEWAY_HOME, 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function cloudflareAvailable() { return false; }
function vercelAvailable() { return false; }


function getGatewayInternalKey() {
  // Reuses getLocalConfig()'s 5s cache. This is called per request and per candidate
  // attempt, so a fresh existsSync+readFileSync+JSON.parse each time was pure overhead.
  const cfg = getLocalConfig();
  return firstEnabledServerKey(cfg);
}

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080', 10);
const GATEWAY_INTERNAL_PORT = parseInt(process.env.GATEWAY_PORT || '8082', 10);
// Explicit GATEWAY_PORT alone keeps single-gateway test/development setups isolated.
const DIRECT_GATEWAY_PORT = parseInt(process.env.DIRECT_GATEWAY_PORT || process.env.GATEWAY_PORT || '8084', 10);
const POOL_FIRST_EVENT_TIMEOUT_MS = Math.min(40000, Number(process.env.POOL_FIRST_CONTENT_TIMEOUT_MS || process.env.POOL_FIRST_EVENT_TIMEOUT_MS) > 0
  ? Number(process.env.POOL_FIRST_CONTENT_TIMEOUT_MS || process.env.POOL_FIRST_EVENT_TIMEOUT_MS) : 40000);
const FIRST_CONTENT_BUDGET_MS = Number(process.env.FIRST_CONTENT_BUDGET_MS || process.env.FAILOVER_BUDGET_MS) > 0
  ? Number(process.env.FIRST_CONTENT_BUDGET_MS || process.env.FAILOVER_BUDGET_MS) : 120000;
const DIRECT_FIRST_CONTENT_TIMEOUT_MS = Math.min(30000, Number(process.env.DIRECT_FIRST_CONTENT_TIMEOUT_MS) > 0
  ? Number(process.env.DIRECT_FIRST_CONTENT_TIMEOUT_MS) : 30000);
const MAX_BACKEND_ATTEMPTS = Math.min(4, Number(process.env.MAX_BACKEND_ATTEMPTS) > 0
  ? Number(process.env.MAX_BACKEND_ATTEMPTS) : 4);
const PASSTHROUGH_CONNECT_TIMEOUT_MS = Number(process.env.PASSTHROUGH_CONNECT_TIMEOUT_MS) > 0
  ? Number(process.env.PASSTHROUGH_CONNECT_TIMEOUT_MS) : 10000;
const PASSTHROUGH_HEADER_TIMEOUT_MS = Number(process.env.PASSTHROUGH_HEADER_TIMEOUT_MS) > 0
  ? Number(process.env.PASSTHROUGH_HEADER_TIMEOUT_MS) : 30000;
const MAX_PASSTHROUGH_BODY_BYTES = Number(process.env.MAX_PASSTHROUGH_BODY_BYTES) > 0
  ? Number(process.env.MAX_PASSTHROUGH_BODY_BYTES) : 64 * 1024 * 1024;
const PROXY_SHUTDOWN_DRAIN_MS = parseInt(process.env.PROXY_SHUTDOWN_DRAIN_MS || '30000', 10);
// Caps so a hostile or broken peer cannot balloon proxy memory. Localhost-only, so this is
// belt-and-braces rather than a hard security boundary.
const MAX_REQ_BODY_BYTES = parseInt(process.env.MAX_REQ_BODY_BYTES || String(64 * 1024 * 1024), 10); // 64MB
const INACTIVITY_TIMEOUT_MS = parseInt(process.env.INACTIVITY_TIMEOUT_MS || '120000', 10);
const MAX_STREAM_DURATION_MS = Number(process.env.MAX_STREAM_DURATION_MS) > 0
  ? Number(process.env.MAX_STREAM_DURATION_MS) : 600000;

let shuttingDownProxy = false;
let inFlightReqs = 0;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[proxy ${ts}] ${msg}`);
}

// Send a JSON error only if the client response has not started; otherwise just close it.
// Prevents ERR_HTTP_HEADERS_SENT crashes when the gateway dies mid-stream.
function sendError(res, status, message, extraHeaders = null) {
  if (res.headersSent || res.writableEnded || res.destroyed) {
    try { res.end(); } catch {}
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify({ error: { message } }));
}

// config.json is re-read at most every 5s, so edits (key rotation, timeouts) apply without a restart.
let localCfgCache = { at: 0, value: {} };
function getLocalConfig() {
  if (Date.now() - localCfgCache.at < 5000) return localCfgCache.value;
  let value = {};
  try { value = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  localCfgCache = { at: Date.now(), value };
  return value;
}

// config/.local-key gates /v1/* and /stats. opencode2api rejects unknown config.json fields, so the
// key lives in its own file. Missing or empty file = open (127.0.0.1 only). Re-read every 5s.
const LOCAL_KEY_FILE = path.join(CONFIG_DIR, '.local-key');
let localKeyCache = { at: 0, value: '' };
function getLocalApiKey() {
  if (Date.now() - localKeyCache.at < 5000) return localKeyCache.value;
  let value = '';
  try { value = fs.readFileSync(LOCAL_KEY_FILE, 'utf8').trim(); } catch {}
  localKeyCache = { at: Date.now(), value };
  return value;
}

function isAuthorized(req) {
  const key = getLocalApiKey();
  if (!key) return true;
  const h = req.headers['authorization'] || '';
  const provided = String(h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-api-key'] || ''));
  const a = Buffer.from(provided);
  const b = Buffer.from(String(key));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Logs a 401 with a short hash of the key the client sent (never the key itself), so a client that
// keeps the wrong key can be identified from the log.
function logAuthFailure(req) {
  const h = req.headers['authorization'] || '';
  const provided = String(h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-api-key'] || ''));
  const digest = provided ? crypto.createHash('sha256').update(provided).digest('hex').slice(0, 8) : 'none';
  let pathname = '/';
  try { pathname = new URL(req.url, 'http://127.0.0.1').pathname.slice(0, 256); } catch {}
  log(`[AUTH] 401 ${req.method} ${pathname} presented=${digest}`);
}

const metrics = {
  started: Date.now(),
  requests: 0,
  ok: 0,
  rejected: 0,
  timeout: 0,
  cancelled: 0,
  stream_error: 0,
  local_unavailable: 0,
  fallbacks: 0,
  rate_limited: 0,
  pool_errors: 0,
  first_event_timeouts: 0,
  unauthorized: 0,
  by_model_ok: Object.create(null),
  by_model_fail: Object.create(null)
};
function countModel(map, model) {
  const key = typeof model === 'string' ? model.slice(0, 256) : '';
  if (!key) return;
  if (Object.hasOwn(map, key)) {
    map[key]++;
    return;
  }
  if (Object.keys(map).length >= 256) {
    map._other = (map._other || 0) + 1;
    return;
  }
  map[key] = 1;
}

const TELEMETRY_FILE = path.join(DATA_DIR, 'requests-v2.jsonl');
const TELEMETRY_STATE_FILE = path.join(DATA_DIR, 'requests-v2-counters.json');
const INFERENCE_PATHS = new Set(['/v1/chat/completions', '/v1/responses', '/v1/messages', '/v1/systemone']);
const METRIC_COUNTER_KEYS = [
  'requests', 'ok', 'rejected', 'timeout', 'cancelled', 'stream_error', 'local_unavailable',
  'fallbacks', 'rate_limited', 'pool_errors', 'first_event_timeouts', 'unauthorized'
];
const terminalRequestIds = new Set();
function rememberTerminalRequest(id) {
  terminalRequestIds.add(id);
  if (terminalRequestIds.size > 4096) terminalRequestIds.delete(terminalRequestIds.values().next().value);
}
let telemetrySequence = 0;
let lastTerminalSequence = 0;
let telemetryLoaded = false;

function logRequestEvent(event) {
  const entry = { ts: new Date().toISOString(), version: 2, sequence: ++telemetrySequence, ...event };
  try {
    appendLog(TELEMETRY_FILE, JSON.stringify(entry) + '\n');
  } catch (error) {
    log(`[TELEMETRY WRITE FAILED] ${error.message}`);
  }
  return entry;
}

function updateTerminalMetrics(event) {
  metrics.requests++;
  if (event.outcome === 'success') metrics.ok++;
  else {
    const outcome = ['rejected', 'timeout', 'cancelled', 'stream_error', 'local_unavailable'].includes(event.outcome)
      ? event.outcome : 'local_unavailable';
    metrics[outcome]++;
  }
  metrics.fallbacks += Number(event.pool_attempts) || 0;
  metrics.first_event_timeouts += Number(event.first_content_timeouts) || 0;
  if (event.status === 429) metrics.rate_limited++;
  if (event.outcome === 'local_unavailable') metrics.pool_errors++;
  if (typeof event.model === 'string' && event.model) {
    if (event.outcome === 'success') countModel(metrics.by_model_ok, event.model);
    else countModel(metrics.by_model_fail, event.model);
  }
}

function persistTelemetryCounters() {
  const counters = {};
  for (const key of METRIC_COUNTER_KEYS) counters[key] = metrics[key];
  counters.by_model_ok = metrics.by_model_ok;
  counters.by_model_fail = metrics.by_model_fail;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    atomicWriteJson(TELEMETRY_STATE_FILE, { version: 2, last_terminal_sequence: lastTerminalSequence, counters });
  } catch (error) {
    log(`[TELEMETRY COUNTERS WRITE FAILED] ${error.message}`);
  }
}

function loadTelemetry() {
  if (telemetryLoaded) return;
  telemetryLoaded = true;
  try {
    const state = JSON.parse(fs.readFileSync(TELEMETRY_STATE_FILE, 'utf8'));
    if (state.version === 2 && state.counters && typeof state.counters === 'object') {
      for (const key of METRIC_COUNTER_KEYS) {
        if (Number.isSafeInteger(state.counters[key]) && state.counters[key] >= 0) metrics[key] = state.counters[key];
      }
      for (const [key, value] of Object.entries(state.counters.by_model_ok || {}).slice(0, 256)) {
        if (key.length <= 256 && Number.isFinite(value) && value >= 0) metrics.by_model_ok[key] = value;
      }
      for (const [key, value] of Object.entries(state.counters.by_model_fail || {}).slice(0, 256)) {
        if (key.length <= 256 && Number.isFinite(value) && value >= 0) metrics.by_model_fail[key] = value;
      }
      lastTerminalSequence = Number(state.last_terminal_sequence) || 0;
      telemetrySequence = lastTerminalSequence;
    }
  } catch {}

  const files = [4, 3, 2, 1].map(index => `${TELEMETRY_FILE}.${index}`).concat(TELEMETRY_FILE);
  let replayed = false;
  for (const file of files) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of content.split(/\r?\n/)) {
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        if (event.version !== 2 || !Number.isFinite(event.sequence)) continue;
        telemetrySequence = Math.max(telemetrySequence, event.sequence);
        if (event.kind !== 'terminal' || !event.request_id) continue;
        if (terminalRequestIds.has(event.request_id)) continue;
        rememberTerminalRequest(event.request_id);
        if (event.sequence <= lastTerminalSequence) continue;
        updateTerminalMetrics(event);
        lastTerminalSequence = event.sequence;
        replayed = true;
      } catch {}
    }
  }
  if (replayed) persistTelemetryCounters();
}

function recordTerminalEvent(event) {
  if (!event.request_id || terminalRequestIds.has(event.request_id)) return false;
  const entry = logRequestEvent({ kind: 'terminal', terminal: true, ...event });
  rememberTerminalRequest(event.request_id);
  updateTerminalMetrics(entry);
  lastTerminalSequence = entry.sequence;
  persistTelemetryCounters();
  return true;
}

function terminalOutcome(result) {
  switch (result?.outcome) {
    case 'success': return 'success';
    case 'timeout': return 'timeout';
    case 'cancelled': return 'cancelled';
    case 'stream_error': return 'stream_error';
    case 'client_error':
    case 'rejected':
    case 'provider_rejected':
    case 'quota':
    case 'model_error': return 'rejected';
    default: return 'local_unavailable';
  }
}

function recordChatTerminal({ requestId, startedAt, model, result = {}, attemptHistory = [], failurePhase }) {
  const durationMs = Math.max(0, Date.now() - startedAt);
  const attemptDurationMs = attemptHistory.reduce((sum, attempt) => sum + (Number(attempt.duration_ms) || 0), 0);
  const outcome = terminalOutcome(result);
  const route = result.route || attemptHistory.at(-1)?.route;
  const event = {
    request_id: requestId,
    attempt_id: result.attemptId || attemptHistory.at(-1)?.attempt_id,
    model: typeof model === 'string' ? model.slice(0, 256) : undefined,
    route,
    status: Number(result.status) || (outcome === 'success' ? 200 : 0),
    outcome,
    failure_phase: failurePhase || result.detail || (outcome === 'success' ? undefined : result.outcome || outcome),
    retry_after_ms: Number(result.retryAfterMs) || undefined,
    attempts: attemptHistory.length,
    pool_attempts: attemptHistory.filter(attempt => attempt.route === 'pool').length,
    first_content_timeouts: attemptHistory.filter(attempt => attempt.outcome === 'slow').length,
    wait_ms: Math.max(0, durationMs - attemptDurationMs),
    duration_ms: durationMs
  };
  recordTerminalEvent(event);
  return outcome;
}



function isRotationAlias(model) {
  const id = String(model || '').trim().toLowerCase().replace(/^opencode2api\//, '');
  return id === 'sota' || id === 'sweet';
}

function filterRotationAliases(payload) {
  if (!payload || !Array.isArray(payload.data)) return payload;
  return { ...payload, data: payload.data.filter(item => !isRotationAlias(item?.id)) };
}

const chatCoordinator = new ChatCoordinator({
  maxActive: Math.min(2, Number(process.env.MAX_ACTIVE_REQUESTS) > 0 ? Number(process.env.MAX_ACTIVE_REQUESTS) : 2),
  maxQueued: Math.min(4, Number(process.env.MAX_QUEUED_REQUESTS) >= 0 ? Number(process.env.MAX_QUEUED_REQUESTS) : 4),
  maxAttempts: MAX_BACKEND_ATTEMPTS,
  directTimeoutMs: DIRECT_FIRST_CONTENT_TIMEOUT_MS,
  poolTimeoutMs: POOL_FIRST_EVENT_TIMEOUT_MS,
  localCooldownMs: Number(process.env.LOCAL_CIRCUIT_COOLDOWN_MS) > 0 ? Number(process.env.LOCAL_CIRCUIT_COOLDOWN_MS) : 500,
  transportCooldownMs: Number(process.env.TRANSPORT_CIRCUIT_COOLDOWN_MS) > 0 ? Number(process.env.TRANSPORT_CIRCUIT_COOLDOWN_MS) : 2000,
  slowCooldownMs: Number(process.env.SLOW_CIRCUIT_COOLDOWN_MS) > 0 ? Number(process.env.SLOW_CIRCUIT_COOLDOWN_MS) : 5000,
  rejectedCooldownMs: Number(process.env.REJECTED_CIRCUIT_COOLDOWN_MS) > 0 ? Number(process.env.REJECTED_CIRCUIT_COOLDOWN_MS) : 30000,
  executeAttempt: async attempt => {
    const attemptStartedAt = Date.now();
    const attemptHeaders = { ...attempt.headers, 'x-gateway-attempt': '', 'x-gateway-relay': attempt.route === 'cloudflare' ? '1' : attempt.route === 'vercel' ? 'vercel' : '' };
    if (attempt.route === 'pool' && attempt.attemptHistory?.length > 0) {
      const baseSes = attemptHeaders['x-session-id'] || 'ses_000000000000';
      attemptHeaders['x-session-id'] = `${baseSes.slice(0, 16)}${crypto.randomBytes(6).toString('hex')}`;
    }
    const result = await executeGatewayAttempt({
      ...attempt,
      headers: attemptHeaders,
      port: attempt.route === 'direct' ? DIRECT_GATEWAY_PORT : GATEWAY_INTERNAL_PORT,
      streamIdleTimeoutMs: INACTIVITY_TIMEOUT_MS,
      streamMaxDurationMs: MAX_STREAM_DURATION_MS
    });
    const attemptEvent = {
      attempt_id: attempt.attemptId,
      route: attempt.route,
      model: typeof attempt.model === 'string' ? attempt.model.slice(0, 256) : undefined,
      status: result.status || 0,
      outcome: result.outcome || 'success',
      exit: result.failedProxy,
      failure_phase: result.detail || undefined,
      retry_after_ms: result.retryAfterMs || undefined,
      duration_ms: Date.now() - attemptStartedAt
    };
    attempt.attemptHistory?.push(attemptEvent);
    logRequestEvent({
      kind: 'attempt', request_id: attempt.requestId,
      exit: result.failedProxy, upstream_responded: result.upstreamResponded,
      model: attempt.model, route: attempt.route, status: result.status || 0,
      outcome: result.outcome || 'success', failure_phase: result.detail || undefined,
      retry_after_ms: result.retryAfterMs || undefined,
      attempt_id: attempt.attemptId, duration_ms: attemptEvent.duration_ms
    });
    return result;
  }
});

function handleChatCompletion(clientReq, clientRes, requestPath = '/v1/chat/completions') {
  const startedAt = Date.now();
  const deadline = startedAt + FIRST_CONTENT_BUDGET_MS;
  const requestId = `r-${startedAt}-${crypto.randomBytes(4).toString('hex')}`;
  const bodyChunks = [];
  let bodyBytes = 0;
  let tooLarge = false;
  let cancelQueuedRequest = null;
  let deadlineExpired = false;
  let terminalLogged = false;
  let model;
  const attemptHistory = [];
  const finish = (result, failurePhase) => {
    if (terminalLogged) return;
    terminalLogged = true;
    recordChatTerminal({ requestId, startedAt, model, result, attemptHistory, failurePhase });
  };
  const bodyBudgetTimer = setTimeout(() => {
    deadlineExpired = true;
    clientRes.shouldKeepAlive = false;
    clientReq.resume();
    finish({ outcome: 'timeout', status: 504 }, 'request_body_deadline');
    sendError(clientRes, 504, `Request exceeded the ${FIRST_CONTENT_BUDGET_MS}ms first-content budget`);
  }, Math.max(1, deadline - Date.now()));

  clientReq.on('data', chunk => {
    if (deadlineExpired || tooLarge) return;
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_REQ_BODY_BYTES) {
      tooLarge = true;
      clientRes.shouldKeepAlive = false;
      bodyChunks.length = 0;
      clientReq.resume();
      clearTimeout(bodyBudgetTimer);
      finish({ outcome: 'rejected', status: 413 }, 'request_body_too_large');
      sendError(clientRes, 413, 'Request body too large');
      return;
    }
    if (!tooLarge) bodyChunks.push(chunk);
  });
  clientReq.once('aborted', () => {
    clearTimeout(bodyBudgetTimer);
    cancelQueuedRequest?.();
    finish({ outcome: 'cancelled', status: 499 }, 'client_aborted_request_body');
  });
  clientRes.once('close', () => {
    clearTimeout(bodyBudgetTimer);
    if (!clientRes.writableFinished) {
      cancelQueuedRequest?.();
      finish({ outcome: 'cancelled', status: 499 }, 'client_disconnected');
    }
  });

  clientReq.once('end', async () => {
    clearTimeout(bodyBudgetTimer);
    if (deadlineExpired || tooLarge) return;
    if (clientRes.destroyed) {
      finish({ outcome: 'cancelled', status: 499 }, 'client_disconnected_before_dispatch');
      return;
    }
    let parsedBody;
    const requestPayload = Buffer.concat(bodyChunks);
    try { parsedBody = JSON.parse(requestPayload.toString('utf8')); }
    catch {
      finish({ outcome: 'rejected', status: 400 }, 'invalid_json_request');
      sendError(clientRes, 400, 'Invalid JSON request body');
      return;
    }
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      finish({ outcome: 'rejected', status: 400 }, 'invalid_json_request_shape');
      sendError(clientRes, 400, 'Request body must be a JSON object');
      return;
    }

    if (typeof parsedBody.model !== 'string' || !parsedBody.model.trim()) {
      finish({ outcome: 'rejected', status: 400 }, 'missing_concrete_model');
      sendError(clientRes, 400, 'A concrete model id is required');
      return;
    }
    if (isRotationAlias(parsedBody.model)) {
      model = parsedBody.model;
      finish({ outcome: 'rejected', status: 400 }, 'rotation_alias_rejected');
      sendError(clientRes, 400, 'Rotation aliases are disabled; select a concrete model id');
      return;
    }

    const sanitizedBody = sanitizeMimoPayload(parsedBody);
    model = sanitizedBody.model;
    const sanitizedPayload = Buffer.from(JSON.stringify(sanitizedBody), 'utf8');

    const upstreamHeaders = { ...clientReq.headers };
    for (const name of ['host', 'connection', 'transfer-encoding', 'content-length', 'expect']) delete upstreamHeaders[name];
    upstreamHeaders['content-type'] = 'application/json';
    upstreamHeaders['content-length'] = String(sanitizedPayload.length);
    upstreamHeaders['accept-encoding'] = 'identity';
    upstreamHeaders['x-session-id'] = resolveSessionId(upstreamHeaders, sanitizedBody);
    const internalKey = getGatewayInternalKey();
    if (internalKey) upstreamHeaders.authorization = `Bearer ${internalKey}`;

    const submitted = chatCoordinator.submit({
      requestId,
      model,
      requestPayload: sanitizedPayload,
      requestPath,
      structuredResponse: !!sanitizedBody.questions && typeof sanitizedBody.questions === 'object',
      headers: upstreamHeaders,
      clientReq,
      clientRes,
      deadline,
      attemptHistory,
      directAvailable: DIRECT_GATEWAY_PORT !== GATEWAY_INTERNAL_PORT,
      cloudflareAvailable: false,
      vercelAvailable: false,
      routes: ['direct', 'pool'],
      directTimeoutMs: DIRECT_FIRST_CONTENT_TIMEOUT_MS,
      poolTimeoutMs: POOL_FIRST_EVENT_TIMEOUT_MS
    });
    cancelQueuedRequest = submitted.cancel;
    const result = await submitted.promise;
    const finalResult = result || { outcome: 'local_unavailable', status: 503 };
    finish(finalResult, finalResult.detail || finalResult.outcome);
    if (clientRes.destroyed || clientRes.writableEnded) return;

    if (finalResult.outcome === 'success') return;
    if (finalResult.outcome === 'stream_error') return;
    const status = finalResult.status || (finalResult.outcome === 'timeout' ? 504 : 503);
    const headers = {};
    const retryAfter = finalResult.retryAfter || (finalResult.retryAfterMs > 0 ? String(Math.max(1, Math.ceil(finalResult.retryAfterMs / 1000))) : '');
    if (retryAfter) headers['Retry-After'] = retryAfter;
    const contentType = finalResult.headers?.['content-type'];
    if (contentType) headers['Content-Type'] = contentType;
    if (finalResult.body?.length) {
      clientRes.writeHead(status, headers);
      clientRes.end(finalResult.body);
      return;
    }
    const message = finalResult.outcome === 'timeout'
      ? `No useful content from model '${model}' within ${FIRST_CONTENT_BUDGET_MS}ms`
      : finalResult.outcome === 'queue_full'
        ? 'Gateway is at its local request capacity; retry shortly'
        : finalResult.outcome === 'provider_rejected'
          ? 'The provider rejected this model request'
          : finalResult.outcome === 'quota'
            ? 'The provider rate-limited this model request'
            : finalResult.outcome === 'model_error'
              ? (finalResult.detail || 'The requested model rejected this request')
              : 'No local gateway route is currently available';
    sendError(clientRes, status, message, headers);
  });
}

function handlePassThrough(clientReq, clientRes, requestPath, url) {
  const catalogRequest = requestPath === '/v1/models' && clientReq.method === 'GET';
  const headers = { ...clientReq.headers };
  for (const name of ['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade']) delete headers[name];
  if (catalogRequest) headers['accept-encoding'] = 'identity';
  const internalKey = getGatewayInternalKey();
  if (internalKey) headers.authorization = 'Bearer ' + internalKey;

  let settled = false;
  let upstreamReq;
  let upstreamRes;
  let connectTimer = null;
  let headerTimer = null;
  let idleTimer = null;
  let maxTimer = null;
  const clearTimers = () => {
    if (connectTimer) clearTimeout(connectTimer);
    if (headerTimer) clearTimeout(headerTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (maxTimer) clearTimeout(maxTimer);
    connectTimer = headerTimer = idleTimer = maxTimer = null;
  };
  const cleanup = () => {
    if (settled) return;
    settled = true;
    clearTimers();
    clientRes.removeListener('close', onClientClose);
    clientRes.removeListener('finish', cleanup);
    clientReq.removeListener('aborted', onClientAbort);
  };
  const fail = (status, message) => {
    if (settled) return;
    log(`[PASSTHROUGH] ${status}: ${message}`);
    const committed = clientRes.headersSent;
    // Mark settled and detach callbacks before destroying upstream sockets. Their synchronous
    // aborted/error events must not replace the original timeout with a misleading 502.
    cleanup();
    try { upstreamReq?.destroy(); } catch {}
    try { upstreamRes?.destroy(); } catch {}
    if (committed) {
      try { clientRes.destroy(); } catch {}
    } else {
      sendError(clientRes, status, message);
    }
  };
  const onClientClose = () => {
    if (clientRes.writableFinished || settled) return;
    cleanup();
    try { upstreamReq?.destroy(); } catch {}
    try { upstreamRes?.destroy(); } catch {}
  };
  const onClientAbort = () => onClientClose();
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fail(504, 'Passthrough response timed out while idle'), INACTIVITY_TIMEOUT_MS);
  };
  clientRes.once('close', onClientClose);
  clientRes.once('finish', cleanup);
  clientReq.once('aborted', onClientAbort);
  maxTimer = setTimeout(() => fail(504, 'Passthrough exceeded its maximum duration'), MAX_STREAM_DURATION_MS);
  connectTimer = setTimeout(() => fail(504, 'Local gateway connection timed out'), PASSTHROUGH_CONNECT_TIMEOUT_MS);
  headerTimer = setTimeout(() => fail(504, 'Local gateway did not return response headers in time'), PASSTHROUGH_HEADER_TIMEOUT_MS);

  try {
    upstreamReq = http.request({
      hostname: '127.0.0.1',
      port: GATEWAY_INTERNAL_PORT,
      path: url,
      method: clientReq.method,
      headers
    }, response => {
      upstreamRes = response;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (headerTimer) { clearTimeout(headerTimer); headerTimer = null; }

      if (catalogRequest) {
        const chunks = [];
        let size = 0;
        resetIdle();
        response.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_PASSTHROUGH_BODY_BYTES) {
            fail(502, 'Model catalog response exceeded the configured size limit');
            return;
          }
          chunks.push(chunk);
          resetIdle();
        });
        response.on('end', () => {
          if (settled) return;
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          let body = Buffer.concat(chunks);
          const outputHeaders = { ...response.headers };
          let parsed = null;
          try { parsed = JSON.parse(body.toString('utf8')); } catch {}
          if (response.statusCode === 200 && parsed) {
            body = Buffer.from(JSON.stringify(filterRotationAliases(parsed)));
            outputHeaders['content-length'] = String(body.length);
            delete outputHeaders['content-encoding'];
            delete outputHeaders['transfer-encoding'];
          }
          clientRes.writeHead(response.statusCode || 502, outputHeaders);
          clientRes.end(body);
        });
      } else {
        const outputHeaders = { ...response.headers };
        for (const name of ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
          'te', 'trailer', 'transfer-encoding', 'upgrade']) delete outputHeaders[name];
        let committed = false;
        let responseBytes = 0;
        resetIdle();
        response.on('data', chunk => {
          responseBytes += chunk.length;
          if (responseBytes > MAX_PASSTHROUGH_BODY_BYTES) {
            fail(502, 'Passthrough response exceeded the configured size limit');
            return;
          }
          if (!committed) {
            committed = true;
            clientRes.writeHead(response.statusCode || 502, outputHeaders);
          }
          resetIdle();
        });
        response.on('end', () => {
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          if (!committed) clientRes.writeHead(response.statusCode || 502, outputHeaders);
        });
        response.pipe(clientRes);
      }
      response.on('error', error => fail(502, 'Local gateway response failed: ' + (error.code || error.message)));
      response.on('aborted', () => fail(502, 'Local gateway response was truncated'));
    });
    upstreamReq.on('socket', socket => {
      if (!socket.connecting && connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      else socket.once('connect', () => {
        if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      });
    });
    upstreamReq.on('error', error => fail(502, 'Gateway unreachable: ' + (error.code || error.message)));
    let requestBytes = 0;
    clientReq.on('data', chunk => {
      requestBytes += chunk.length;
      if (requestBytes > MAX_REQ_BODY_BYTES) fail(413, 'Passthrough request body exceeded the configured size limit');
    });
    clientReq.pipe(upstreamReq);
  } catch (error) {
    fail(502, 'Gateway request failed: ' + (error.code || error.message));
  }
}

const EVENT_LOOP_LAG_INTERVAL_MS = 1000;
const LIVE_EVENT_LOOP_LAG_LIMIT_MS = 5000;
let eventLoopLagMs = 0;
let expectedEventLoopTick = Date.now() + EVENT_LOOP_LAG_INTERVAL_MS;
const eventLoopMonitor = setInterval(() => {
  const now = Date.now();
  eventLoopLagMs = Math.max(0, now - expectedEventLoopTick);
  expectedEventLoopTick = now + EVENT_LOOP_LAG_INTERVAL_MS;
}, EVENT_LOOP_LAG_INTERVAL_MS);
eventLoopMonitor.unref();

function probeLocalGateway(port) {
  return new Promise(resolve => {
    let settled = false;
    let hardTimer = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (hardTimer) clearTimeout(hardTimer);
      resolve(value);
    };
    const request = http.get({ host: '127.0.0.1', port, path: '/__gateway_livez', timeout: 650 }, response => {
      response.resume();
      // The installed Go binary has no dedicated liveness route: a local 404/401
      // still proves its HTTP loop responds without consulting an upstream.
      response.once('end', () => finish(response.statusCode >= 200 && response.statusCode < 500));
      response.once('error', () => finish(false));
    });
    hardTimer = setTimeout(() => { request.destroy(); finish(false); }, 800);
    request.once('timeout', () => request.destroy());
    request.once('error', () => finish(false));
  });
}


async function localReadiness() {
  const [direct, relayGateway] = await Promise.all([
    probeLocalGateway(DIRECT_GATEWAY_PORT),
    probeLocalGateway(GATEWAY_INTERNAL_PORT)
  ]);
  const authenticated = !!getGatewayInternalKey();
  const routes = {
    direct: { port: DIRECT_GATEWAY_PORT, available: direct && authenticated },
    gateway: { port: GATEWAY_INTERNAL_PORT, available: relayGateway && authenticated }
  };
  const causes = [];
  if (!authenticated) causes.push('internal_authentication_unavailable');
  if (!direct && !relayGateway) causes.push('gateway_backend_unavailable');
  return {
    ready: routes.direct.available || routes.gateway.available,
    local_routes: routes,
    degraded_causes: causes,
    remote_generation: 'direct_only'
  };
}

function countUnauthorized() {
  metrics.unauthorized++;
  persistTelemetryCounters();
}

async function handleProxyRequest(clientReq, clientRes) {
  const url = clientReq.url;
  let requestPath = url;
  try { requestPath = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname); }
  catch { sendError(clientRes, 400, 'Invalid request path'); return; }

  if (requestPath === '/livez' && clientReq.method === 'GET') {
    const live = eventLoopLagMs <= LIVE_EVENT_LOOP_LAG_LIMIT_MS;
    clientRes.writeHead(live ? 200 : 503, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({
      status: live ? 'alive' : 'event_loop_delayed',
      process_id: process.pid,
      event_loop_lag_ms: eventLoopLagMs
    }));
    return;
  }

  if ((requestPath === '/readyz' || requestPath === '/healthz') && clientReq.method === 'GET') {
    const state = await localReadiness();
    const compatibility = requestPath === '/healthz';
    const payload = {
      status: state.ready ? 'ok' : (compatibility ? 'degraded' : 'not_ready'),
      service: 'OpenCode Resilient Gateway Proxy',
      ready: state.ready,
      local_routes: state.local_routes,
      degraded_causes: state.degraded_causes,
      remote_generation: state.remote_generation,
      internal_gateway: `127.0.0.1:${GATEWAY_INTERNAL_PORT}`,
      direct_gateway: `127.0.0.1:${DIRECT_GATEWAY_PORT}`,
      model_cooldowns: {},
      circuit_breakers: chatCoordinator.circuits.snapshot()
    };
    clientRes.writeHead(state.ready ? 200 : 503, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify(payload));
    return;
  }

  // In-band graceful shutdown (pm2 shutdown_with_message pattern). Windows signals
  // degrade to TerminateProcess, so the watchdog POSTs here and waits for drain
  // instead of hard-killing mid-stream. Auth required when .local-key is set.
  if (url === '/shutdown' && clientReq.method === 'POST') {
    if (!isAuthorized(clientReq)) {
      countUnauthorized();
      sendError(clientRes, 401, 'Invalid or missing local API key');
      return;
    }
    if (!shuttingDownProxy) {
      shuttingDownProxy = true;
      log(`[PROXY] Shutdown requested. Draining ${inFlightReqs} in-flight request(s) (max ${PROXY_SHUTDOWN_DRAIN_MS}ms)...`);
      const deadline = Date.now() + PROXY_SHUTDOWN_DRAIN_MS;
      const tryExit = () => {
        // inFlightReqs includes this /shutdown request itself.
        if (inFlightReqs === 0 || Date.now() > deadline) {
          log('[PROXY] Shutdown drain complete. Exiting.');
          process.exit(0);
        }
        setTimeout(tryExit, 100);
      };
      setTimeout(tryExit, 50);
    }
    clientRes.writeHead(200, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({ status: 'shutting_down', in_flight: inFlightReqs }));
    return;
  }

  if (shuttingDownProxy) {
    sendError(clientRes, 503, 'Proxy is shutting down');
    return;
  }

  inFlightReqs++;
  clientRes.on('close', () => { inFlightReqs--; });

  // Metrics snapshot (auth required when config/.local-key is set)
  if (url === '/stats' && clientReq.method === 'GET') {
    if (!isAuthorized(clientReq)) {
      countUnauthorized();
      sendError(clientRes, 401, 'Invalid or missing local API key');
      return;
    }
    const now = Date.now();
    const cooldowns = {};
    const circuits = chatCoordinator.circuits.snapshot();
    for (const [key, state] of Object.entries(circuits)) {
      if (state.remainingMs > 0) cooldowns[key] = Math.ceil(state.remainingMs / 1000);
    }
    clientRes.writeHead(200, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({
      ...metrics,
      uptime_s: Math.round((now - metrics.started) / 1000),
      cooldowns_s: cooldowns,
      telemetry_version: 2,
      half_open_probes: Object.entries(circuits).filter(([, state]) => state.probeInFlight).map(([key]) => key),
      shutting_down: shuttingDownProxy
    }, null, 2));
    return;
  }

  // Prometheus-style text export of the same counters (auth-gated like /stats).
  if (url === '/metrics' && clientReq.method === 'GET') {
    if (!isAuthorized(clientReq)) {
      countUnauthorized();
      sendError(clientRes, 401, 'Invalid or missing local API key');
      return;
    }
    const lines = [];
    const counter = (name, value) => {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    };
    counter('proxy_requests_total', metrics.requests);
    counter('proxy_success_total', metrics.ok);
    counter('proxy_rejected_total', metrics.rejected);
    counter('proxy_timeout_total', metrics.timeout);
    counter('proxy_cancelled_total', metrics.cancelled);
    counter('proxy_stream_error_total', metrics.stream_error);
    counter('proxy_local_unavailable_total', metrics.local_unavailable);
    counter('proxy_fallback_attempts_total', metrics.fallbacks);
    counter('proxy_rate_limited_total', metrics.rate_limited);
    counter('proxy_first_content_timeouts_total', metrics.first_event_timeouts);
    counter('proxy_unauthorized_total', metrics.unauthorized);
    lines.push('# TYPE proxy_uptime_seconds gauge');
    lines.push(`proxy_uptime_seconds ${Math.round((Date.now() - metrics.started) / 1000)}`);
    lines.push('# TYPE proxy_in_flight gauge');
    lines.push(`proxy_in_flight ${inFlightReqs}`);
    const labelValue = value => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
    for (const [model, n] of Object.entries(metrics.by_model_ok)) lines.push(`proxy_model_ok_total{model="${labelValue(model)}"} ${n}`);
    for (const [model, n] of Object.entries(metrics.by_model_fail)) lines.push(`proxy_model_fail_total{model="${labelValue(model)}"} ${n}`);
    clientRes.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    clientRes.end(lines.join('\n') + '\n');
    return;
  }

  if (requestPath.startsWith('/v1/') && !isAuthorized(clientReq)) {
    countUnauthorized();
    logAuthFailure(clientReq);
    if (INFERENCE_PATHS.has(requestPath) && clientReq.method === 'POST') {
      const startedAt = Date.now();
      recordTerminalEvent({
        request_id: `r-${startedAt}-${crypto.randomBytes(4).toString('hex')}`,
        outcome: 'rejected', status: 401, failure_phase: 'client_authentication',
        attempts: 0, pool_attempts: 0, first_content_timeouts: 0, wait_ms: 0, duration_ms: 0
      });
    }
    sendError(clientRes, 401, 'Invalid or missing local API key');
    return;
  }

  if (INFERENCE_PATHS.has(requestPath) && clientReq.method === 'POST') {
    handleChatCompletion(clientReq, clientRes, requestPath);
    return;
  }

  handlePassThrough(clientReq, clientRes, requestPath, url);
}

function startServer(attempt = 0) {
  const server = http.createServer(handleProxyRequest);
  server.on('error', (err) => {
    // Belt-and-suspenders with the watchdog's whenPortFree poll: if the port frees
    // between the poll and our bind, retry instead of exit-looping.
    if (err.code === 'EADDRINUSE' && attempt < 10) {
      log(`[PROXY] Port ${PROXY_PORT} in use (attempt ${attempt + 1}/10). Retrying in 500ms...`);
      setTimeout(() => startServer(attempt + 1), 500);
      return;
    }
    log(`[PROXY FATAL] Error binding port ${PROXY_PORT}: ${err.message}`);
    process.exit(1);
  });
  server.listen(PROXY_PORT, '127.0.0.1', () => {
    log(`[PROXY] Resilient Proxy on http://127.0.0.1:${PROXY_PORT} -> direct :${DIRECT_GATEWAY_PORT}, Cloudflare backend :${GATEWAY_INTERNAL_PORT}; SOCKS pool retired`);
  });
}

// If the watchdog dies, our stdout pipe breaks; swallow EPIPE instead of erroring on every log line.
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

// Last line of defence: one bad request must not take down every in-flight stream.
process.on('uncaughtException', (err) => {
  log(`[PROXY UNCAUGHT] ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (err) => {
  log(`[PROXY UNHANDLED REJECTION] ${err && err.stack ? err.stack : err}`);
});

loadTelemetry();
startServer();
