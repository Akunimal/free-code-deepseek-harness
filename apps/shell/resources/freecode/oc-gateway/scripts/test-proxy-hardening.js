// Regression tests for proxy.js. Runs an isolated proxy against a mock gateway on spare ports
// with its own config home, so the live :8080/:8082 stack and config.json are never touched.
//   node scripts/test-proxy-hardening.js
const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let mockPort;
let proxyPort;
let poolFrontPort;
const LOCAL_KEY = 'test-local-key';
let fail = 0;
let quotaHit = false;
let rotations = 0;
let passthroughCancelled = false;
let backendHealthy = true;
let lastInferencePath;
let hangRotation = false;
let cancelledRotationClosed = false;
const calls = {};

// Isolated config home with a local key and short mock timeouts. Nothing from the live config/ is read.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-hardening-'));
fs.mkdirSync(path.join(home, 'config'));
fs.writeFileSync(path.join(home, 'config', 'config.json'), JSON.stringify({
  server_keys: ['internal-test-token'],
  performance: { first_event_timeout_seconds: 1 }
}));
fs.writeFileSync(path.join(home, 'config', '.local-key'), LOCAL_KEY + '\n');
fs.writeFileSync(path.join(home, 'config', 'models.json'), JSON.stringify({
  cooldown_cap_seconds: 300,
  models: {
    'mimo-v2.6-flash-free': { modalities: ['text'], context_window: 200000, max_output: 32000 },
    'pool-model': { modalities: ['text'], context_window: 200000, max_output: 32000 },
    'other-ok-model': { modalities: ['text'], context_window: 200000, max_output: 32000 },
    'hang-model': { modalities: ['text'], context_window: 200000, max_output: 32000 },
    'hang-ok-model': { modalities: ['text'], context_window: 200000, max_output: 32000 },
    'cancel-model': { modalities: ['text'], context_window: 200000, max_output: 32000 }
  },
  fallback_chains: { 'pool-model': ['other-ok-model'], 'hang-model': ['hang-ok-model'], default: ['other-ok-model'] }
}));
fs.mkdirSync(path.join(home, 'data'), { recursive: true });
fs.writeFileSync(path.join(home, 'data', 'requests.jsonl'), JSON.stringify({
  version: 1, kind: 'result', request_id: 'historical-false-success', outcome: 'success', model: 'old-model'
}) + '\n');

const mock = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__gateway_livez') {
    res.writeHead(backendHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ alive: backendHealthy }));
    return;
  }
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pool_size: 1, is_harvesting: false, generation_confirmed: false }));
    return;
  }
  if (req.url === '/rotate') {
    rotations++; req.resume();
    if (hangRotation) {
      res.writeHead(200); res.flushHeaders();
      const timer = setInterval(() => res.write(' '), 20);
      res.once('close', () => { clearInterval(timer); cancelledRotationClosed = true; });
    } else res.end('{"ok":true}');
    return;
  }
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'alpha' }, { id: 'sota' }, { id: 'sweet' }] }));
    return;
  }
  if (req.method === 'GET' && req.url === '/v1/noheaders') return;
  if (req.method === 'GET' && ['/v1/hold', '/v1/hold-cancel', '/v1/slow'].includes(req.url)) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    if (req.url === '/v1/hold') { res.flushHeaders(); return; }
    if (req.url === '/v1/hold-cancel') {
      const interval = setInterval(() => res.write('x'), 30);
      res.on('close', () => { passthroughCancelled = true; clearInterval(interval); });
      return;
    }
    const interval = setInterval(() => res.write('x'), 30);
    res.on('close', () => clearInterval(interval));
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    let body = {};
    try { body = JSON.parse(raw.toString('utf8')); } catch {}
    const model = body.model;
    lastInferencePath = req.url;
    const content = body.messages?.[0]?.content || '';
    if (content === 'ROTATE_WAIT') return res.writeHead(503).end('{}');
    if (req.url === '/v1/systemone' && content === 'same concrete model') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{"answers":{"arithmetic":false,"count":0}}');
    }
    calls[model] = (calls[model] || 0) + 1;

    if (model === 'mimo-v2.6-flash-free' && content.startsWith('UTF8')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ replacement: content.includes('�'), length: content.length,
        choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
      return;
    }
    if (model === 'mimo-v2.6-flash-free' && content === 'RESET') {
      // Headers + first chunk sent, then the gateway dies mid-stream.
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
      setTimeout(() => req.socket.resetAndDestroy(), 100);
      return;
    }
    if (model === 'mimo-v2.6-flash-free' && content === 'QUOTA' && !quotaHit) {
      quotaHit = true;
      res.writeHead(429, { 'Retry-After': '23436' });
      res.end('{}');
      return;
    }
    if (content === 'SSE_FRAGMENT') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
      const frame = Buffer.from('data: {"choices":[{"delta":{"content":"ñ🙂"}}]}\n\n', 'utf8');
      const split = frame.indexOf(Buffer.from('🙂')) + 2;
      res.write(frame.subarray(0, split));
      setTimeout(() => res.end(Buffer.concat([frame.subarray(split), Buffer.from('data: [DONE]\n\n')])), 10);
      return;
    }
    if (content === 'SSE_ERROR') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('event: error\ndata: {"error":{"message":"provider denied"}}\n\n');
      return;
    }
    if (content === 'SSE_EOF') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: {"choices":[{"delta":{"content":"incomplete"}}]}\n\n');
      return;
    }
    if (content === 'CANCEL') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.flushHeaders();
      const keepalive = setInterval(() => res.write(': keep-alive\n\n'), 30);
      res.on('close', () => clearInterval(keepalive));
      return;
    }
    if (content === 'EMPTY') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    if (content === 'BACKPRESSURE') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      let sent = 0;
      const interval = setInterval(() => {
        if (sent >= 50) {
          clearInterval(interval);
          res.end('data: [DONE]\n\n');
          return;
        }
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(8192) } }] }) + '\n\n');
        sent++;
      }, 2);
      res.on('close', () => clearInterval(interval));
      return;
    }
    if (content === 'SHORT429') {
      res.writeHead(429, { 'Retry-After': '1' });
      res.end('{}');
      return;
    }
    if (content === 'UPSTREAM401') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"bad credentials"}');
      return;
    }
    if (model === 'pool-model') {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'no healthy anonymous proxies available' } }));
      return;
    }
    if (model === 'hang-model') {
      // Keep-alive comments must not satisfy first-content confirmation.
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const keepalive = setInterval(() => res.write(': keep-alive\n\n'), 100);
      req.on('close', () => clearInterval(keepalive));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model, choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
  });
});

function request({ method = 'POST', urlPath = '/v1/chat/completions', content, rawPayload, model = 'mimo-v2.6-flash-free', key = LOCAL_KEY, timeoutMs = 15000, cancelAfterMs = 0 }) {
  return new Promise((resolve) => {
    let settled = false;
    let cancelling = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const payload = rawPayload !== undefined ? Buffer.from(rawPayload) : content === undefined
      ? null
      : Buffer.from(JSON.stringify({ model, messages: [{ role: 'user', content }] }), 'utf8');
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = `Bearer ${key}`;
    if (payload) headers['Content-Length'] = payload.length;
    const req = http.request({ hostname: '127.0.0.1', port: proxyPort, path: urlPath, method, headers }, (res) => {
      const out = [];
      res.on('data', (c) => out.push(c));
      res.on('end', () => finish({ status: res.statusCode, headers: res.headers, body: Buffer.concat(out).toString('utf8') }));
      res.on('error', () => finish({ status: res.statusCode, body: Buffer.concat(out).toString('utf8'), aborted: true }));
      res.on('aborted', () => finish({ status: res.statusCode, body: Buffer.concat(out).toString('utf8'), aborted: true }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); finish({ status: 0, body: 'timeout' }); });
    req.on('error', e => finish(cancelling ? { status: 0, cancelled: true } : { status: 0, body: e.message }));
    if (cancelAfterMs > 0) setTimeout(() => { cancelling = true; req.destroy(); finish({ status: 0, cancelled: true }); }, cancelAfterMs);
    if (!payload) return req.end();
    // Send in small pieces so multi-byte characters straddle chunk boundaries.
    let i = 0;
    (function writeNext() {
      if (i >= payload.length) return req.end();
      req.write(payload.subarray(i, i + 1001));
      i += 1001;
      setImmediate(writeNext);
    })();
  });
}

function requestSlowStream() {
  return new Promise(resolve => {
    const payload = Buffer.from(JSON.stringify({ model: 'mimo-v2.6-flash-free', stream: true,
      messages: [{ role: 'user', content: 'BACKPRESSURE' }] }), 'utf8');
    const chunks = [];
    const req = http.request({ hostname: '127.0.0.1', port: proxyPort, path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, Authorization: 'Bearer ' + LOCAL_KEY } }, res => {
      res.on('data', chunk => {
        chunks.push(chunk);
        res.pause();
        setTimeout(() => res.resume(), 8);
      });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('aborted', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), aborted: true }));
    });
    req.on('error', error => resolve({ status: 0, body: error.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.end(payload);
  });
}

function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
}

let proxy;
let proxyExited = false;
let proxyLog = '';
function spawnProxy() {
  const child = spawn(process.execPath, [path.join(__dirname, 'proxy.js')], {
    env: {
      ...process.env,
      OC_GATEWAY_HOME: home,
      PROXY_PORT: String(proxyPort),
      GATEWAY_PORT: String(mockPort),
      DIRECT_GATEWAY_PORT: String(mockPort),
      ROTATOR_PORT: String(mockPort),
      POOL_FRONT_PORT: String(poolFrontPort),
      TOR_CONTROL_PORT: '19051',
      WEBUI_PORT: '18081',
      ROTATE_SETTLE_MS: '200',
      POOL_WAIT_MS: '200',
      POOL_FIRST_EVENT_TIMEOUT_MS: '1000',
      DIRECT_FIRST_CONTENT_TIMEOUT_MS: '1000',
      FIRST_CONTENT_BUDGET_MS: '4000',
      INACTIVITY_TIMEOUT_MS: '200',
      MAX_STREAM_DURATION_MS: '1500',
      PASSTHROUGH_CONNECT_TIMEOUT_MS: '200',
      PASSTHROUGH_HEADER_TIMEOUT_MS: '300',
      MAX_BACKEND_ATTEMPTS: '4',
      TRANSPORT_CIRCUIT_COOLDOWN_MS: '10',
      SLOW_CIRCUIT_COOLDOWN_MS: '10',
      REJECTED_CIRCUIT_COOLDOWN_MS: '10'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.on('exit', () => { if (child === proxy) proxyExited = true; });
  child.stdout.on('data', d => proxyLog += d);
  child.stderr.on('data', d => proxyLog += d);
  return child;
}

function createPoolFrontMock() {
  return net.createServer(socket => {
    let received = Buffer.alloc(0);
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk]);
      if (received.length >= 3) socket.write(Buffer.from([0x05, 0x00]));
    });
  });
}

async function stopProxy(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill();
  await exited;
}

async function main() {
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  mockPort = mock.address().port;
  let poolFrontMock = createPoolFrontMock();
  await new Promise(r => poolFrontMock.listen(0, '127.0.0.1', r));
  poolFrontPort = poolFrontMock.address().port;
  const reservation = http.createServer();
  await new Promise((r) => reservation.listen(0, '127.0.0.1', r));
  proxyPort = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  proxy = spawnProxy();
  await new Promise((r) => setTimeout(r, 800));

  try {
    const initialStats = await request({ method: 'GET', urlPath: '/stats', content: undefined });
    let initialCounters = {};
    try { initialCounters = JSON.parse(initialStats.body); } catch {}
    check('Legacy V1 request history is preserved but never hydrated as current success',
      initialStats.status === 200 && initialCounters.requests === 0 && initialCounters.ok === 0,
      `status=${initialStats.status} requests=${initialCounters.requests} ok=${initialCounters.ok}`);
    for (const endpoint of ['/v1/responses', '/v1/messages', '/v1/systemone', '/v1/%72esponses']) {
      const denied = await request({ urlPath: endpoint, model: 'sota', content: 'alias must not reach backend' });
      check(`Concrete model required for ${endpoint}`, denied.status === 400, `status=${denied.status}`);
      const valid = await request({ urlPath: endpoint, content: 'same concrete model' });
      check(`Bounded inference preserves endpoint ${endpoint}`, valid.status === 200 && lastInferencePath === decodeURIComponent(endpoint), `status=${valid.status} path=${lastInferencePath}`);
    }
    const absoluteAuth = await request({ urlPath: `http://127.0.0.1:${proxyPort}/v1/chat/completions`, key: '', content: 'unauthorized' });
    check('Absolute-form request cannot bypass local authentication', absoluteAuth.status === 401, `status=${absoluteAuth.status}`);
    const nullBody = await request({ rawPayload: 'null' });
    check('JSON null is rejected promptly as a client error', nullBody.status === 400, `status=${nullBody.status}`);
    const prefixedAlias = await request({ model: 'OpEnCoDe2ApI/sWeEt', content: 'alias' });
    check('Prefixed rotation aliases are rejected regardless of case', prefixedAlias.status === 400, `status=${prefixedAlias.status}`);
    hangRotation = true;
    await request({ model: 'rotate-cancel', content: 'ROTATE_WAIT', cancelAfterMs: 100 });
    await new Promise(resolve => setTimeout(resolve, 100));
    hangRotation = false;
    check('Cancellation never contacts the retired rotator', rotations === 0);

    const utf = await request({ content: 'UTF8 ' + 'ñandú acción € 日本語 '.repeat(20000) });
    let parsed = {};
    try { parsed = JSON.parse(utf.body); } catch {}
    check('UTF-8 body split across chunks stays intact', utf.status === 200 && parsed.replacement === false,
      `status=${utf.status} replacement=${parsed.replacement}`);

    const reset = await request({ content: 'RESET' });
    await new Promise((r) => setTimeout(r, 500));
    check('Gateway reset mid-stream does not crash proxy', !proxyExited, `client got status=${reset.status}`);

    const after = await request({ content: 'hello' });
    check('Proxy still serves after mid-stream reset', after.status === 200, `status=${after.status}`);

    const fragmented = await request({ content: 'SSE_FRAGMENT' });
    check('Fragmented SSE confirms UTF-8 content before committing', fragmented.status === 200 && fragmented.body.includes('ñ🙂'),
      `status=${fragmented.status} utf8=${fragmented.body.includes('ñ🙂')}`);
    const eofCalls = calls['eof-model'] || 0;
    const truncated = await request({ content: 'SSE_EOF', model: 'eof-model' });
    check('Clean HTTP EOF without a protocol terminal event remains an incomplete stream and is not replayed',
      calls['eof-model'] === eofCalls + 1 && (truncated.aborted === true || truncated.status === 0),
      `calls=${calls['eof-model'] - eofCalls} status=${truncated.status} aborted=${truncated.aborted}`);
    const beforeSseError = calls['mimo-v2.6-flash-free'] || 0;
    const sseError = await request({ content: 'SSE_ERROR' });
    check('HTTP 200 SSE error before content is retried within bounds', sseError.status === 502 && calls['mimo-v2.6-flash-free'] === beforeSseError + 4,
      `status=${sseError.status} calls=${(calls['mimo-v2.6-flash-free'] || 0) - beforeSseError}`);
    const empty = await request({ content: 'EMPTY' });
    check('Empty JSON completion is not reported as success', empty.status === 502, `status=${empty.status}`);
    const slowStream = await requestSlowStream();
    check('Client backpressure pauses and resumes an SSE stream without loss',
      slowStream.status === 200 && slowStream.body.includes('[DONE]') && slowStream.body.includes('"content":"x'),
      `status=${slowStream.status} bytes=${Buffer.byteLength(slowStream.body)} aborted=${slowStream.aborted}`);

    // Auth: /v1 needs the local key; liveness/readiness stay open and never generate.
    const noKey = await request({ content: 'hello', key: null });
    check('Request without local key is rejected (401)', noKey.status === 401, `status=${noKey.status}`);
    const wrongKey = await request({ content: 'hello', key: 'nope' });
    check('Request with wrong local key is rejected (401)', wrongKey.status === 401, `status=${wrongKey.status}`);
    const health = await request({ method: 'GET', urlPath: '/healthz', content: undefined, key: null });
    check('/healthz stays open without a key', health.status === 200, `status=${health.status}`);
    const live = await request({ method: 'GET', urlPath: '/livez', content: undefined, key: null });
    check('/livez reports process liveness', live.status === 200 && JSON.parse(live.body).status === 'alive', `status=${live.status}`);
    const callsBeforeHealth = Object.values(calls).reduce((sum, count) => sum + count, 0);
    const ready = await request({ method: 'GET', urlPath: '/readyz', content: undefined, key: null });
    let readyState = {};
    try { readyState = JSON.parse(ready.body); } catch {}
    check('/readyz accepts a usable local route and marks degraded routes', ready.status === 200 && readyState.ready === true &&
      readyState.local_routes?.pool === undefined && readyState.local_routes?.direct?.available === true && readyState.remote_generation === 'unchecked',
    `status=${ready.status} causes=${(readyState.degraded_causes || []).join(',')}`);
    check('Health probes do not send inference requests', Object.values(calls).reduce((sum, count) => sum + count, 0) === callsBeforeHealth);

    await new Promise(resolve => poolFrontMock.close(resolve));
    const noFrontReady = await request({ method: 'GET', urlPath: '/readyz', content: undefined, key: null });
    let noFrontState = {};
    try { noFrontState = JSON.parse(noFrontReady.body); } catch {}
    check('Readiness stays 200 through direct route when pool front is down', noFrontReady.status === 200 &&
      noFrontState.degraded_causes?.length === 0, `status=${noFrontReady.status}`);
    poolFrontMock = createPoolFrontMock();
    await new Promise(resolve => poolFrontMock.listen(poolFrontPort, '127.0.0.1', resolve));
    backendHealthy = false;
    const unavailableReady = await request({ method: 'GET', urlPath: '/readyz', content: undefined, key: null });
    const unavailableHealth = await request({ method: 'GET', urlPath: '/healthz', content: undefined, key: null });
    backendHealthy = true;
    let unavailableState = {};
    try { unavailableState = JSON.parse(unavailableReady.body); } catch {}
    check('/readyz and compatibility /healthz return 503 when all local routes fail',
      unavailableReady.status === 503 && unavailableHealth.status === 503 && unavailableState.ready === false &&
      unavailableState.degraded_causes.includes('direct_gateway_unavailable') &&
      unavailableState.local_routes.pool === undefined,
      `ready=${unavailableReady.status} health=${unavailableHealth.status}`);

    const catalog = await request({ method: 'GET', urlPath: '/v1/models', content: undefined });
    let catalogIds = [];
    try { catalogIds = JSON.parse(catalog.body).data.map(item => item.id); } catch {}
    check('Passthrough catalog removes rotation aliases', catalog.status === 200 && catalogIds.join(',') === 'alpha',
      `status=${catalog.status} models=${catalogIds.join(',')}`);
    const noHeadersAt = Date.now();
    const noHeaders = await request({ method: 'GET', urlPath: '/v1/noheaders', content: undefined });
    check('Passthrough bounds time to response headers', noHeaders.status === 504 && Date.now() - noHeadersAt < 1500,
      `status=${noHeaders.status} in ${Date.now() - noHeadersAt}ms`);
    const heldAt = Date.now();
    const held = await request({ method: 'GET', urlPath: '/v1/hold', content: undefined });
    check('Passthrough bounds a response that remains idle before content', held.status === 504 && Date.now() - heldAt < 1200,
      `status=${held.status} in ${Date.now() - heldAt}ms body=${held.body || ''}`);
    const slowAt = Date.now();
    const slow = await request({ method: 'GET', urlPath: '/v1/slow', content: undefined });
    check('Passthrough enforces maximum response duration', slow.status === 200 && slow.aborted === true && Date.now() - slowAt < 3000,
      `status=${slow.status} aborted=${slow.aborted} in ${Date.now() - slowAt}ms`);
    const cancelled = await request({ method: 'GET', urlPath: '/v1/hold-cancel', content: undefined, cancelAfterMs: 50 });
    await new Promise(resolve => setTimeout(resolve, 50));
    check('Passthrough cancellation closes its upstream socket', cancelled.status === 0 && passthroughCancelled,
      `client_status=${cancelled.status} upstream_closed=${passthroughCancelled}`);

    const beforeUnauthorizedUpstream = calls['mimo-v2.6-flash-free'] || 0;
    const rotationsBeforeUnauthorizedUpstream = rotations;
    const upstreamAuth = await request({ content: 'UPSTREAM401' });
    check('Upstream rejection stays bounded and never contacts retired services',
      upstreamAuth.status === 401 && calls['mimo-v2.6-flash-free'] === beforeUnauthorizedUpstream + 4 && rotations === rotationsBeforeUnauthorizedUpstream,
      `status=${upstreamAuth.status} calls=${(calls['mimo-v2.6-flash-free'] || 0) - beforeUnauthorizedUpstream} rotations=${rotations - rotationsBeforeUnauthorizedUpstream}`);

    // A long Retry-After is returned to the caller without repeating provider work.
    const beforeQuota = calls['mimo-v2.6-flash-free'] || 0;
    const quota = await request({ content: 'QUOTA' });
    let quotaModel;
    try { quotaModel = JSON.parse(quota.body).model; } catch {}
    check('Long direct quota is returned honestly when no independent route is configured', quota.status === 429 && calls['mimo-v2.6-flash-free'] === beforeQuota + 1,
      `status=${quota.status} model=${quotaModel}`);

    // Pool empty: stop at 503 after one retry, do not try other-ok-model.
    const beforePool = calls['other-ok-model'] || 0;
    const t1 = Date.now();
    const pool = await request({ model: 'pool-model', content: 'pool test' });
    const poolCalls = calls['pool-model'];
    check('Empty pool returns local-unavailable without substituting another model',
      pool.status === 503 && (calls['other-ok-model'] || 0) === beforePool && Date.now() - t1 < 10000,
      `status=${pool.status} other_calls=${(calls['other-ok-model'] || 0) - beforePool} pool_calls=${poolCalls} in ${Date.now() - t1}ms`);

    // Silent upstream is bounded to four attempts on the requested model; it never changes models.
    const t2 = Date.now();
    const hang = await request({ model: 'hang-model', content: 'hang test' });
    const hangMs = Date.now() - t2;
    check('Silent upstream times out without substituting another model',
      hang.status === 504 && (calls['hang-ok-model'] || 0) === 0 && hangMs < 8000,
      `status=${hang.status} changed_model_calls=${calls['hang-ok-model'] || 0} in ${hangMs}ms`);

    const cancelledChat = await request({ model: 'cancel-model', content: 'CANCEL', cancelAfterMs: 100 });
    check('Client cancellation is recorded without leaving a generation running', cancelledChat.cancelled === true,
      `status=${cancelledChat.status} client_cancelled=${cancelledChat.cancelled}`);

    const stats = await request({ method: 'GET', urlPath: '/stats', content: undefined });
    let s = {};
    try { s = JSON.parse(stats.body); } catch {}
    check('/stats reports counters (auth-protected)', stats.status === 200 && s.first_event_timeouts >= 1 && s.pool_errors >= 1 && s.unauthorized >= 2,
      `status=${stats.status} first_event_timeouts=${s.first_event_timeouts} pool_errors=${s.pool_errors} unauthorized=${s.unauthorized}`);

    const noStats = await request({ method: 'GET', urlPath: '/stats', content: undefined, key: null });
    check('/stats rejects requests without the local key', noStats.status === 401, `status=${noStats.status}`);

    const t3 = Date.now();
    const loop = await request({ content: 'SHORT429', timeoutMs: 30000 });
    check('Repeated short Retry-After is bounded', loop.status !== 0 && Date.now() - t3 < 25000,
      `status=${loop.status} after ${Date.now() - t3}ms`);

    const beforeRestart = await request({ method: 'GET', urlPath: '/stats', content: undefined });
    let beforeCounters = {};
    try { beforeCounters = JSON.parse(beforeRestart.body); } catch {}
    const telemetryPath = path.join(home, 'data', 'requests-v2.jsonl');
    let terminalEvents = [];
    try {
      terminalEvents = fs.readFileSync(telemetryPath, 'utf8').split(/\r?\n/).filter(Boolean)
        .map(line => JSON.parse(line)).filter(event => event.version === 2 && event.kind === 'terminal');
    } catch {}
    const terminalIds = terminalEvents.map(event => event.request_id);
    check('Missing protocol termination is recorded as stream_error',
      terminalEvents.some(event => event.model === 'eof-model' && event.outcome === 'stream_error'));
    check('Rejected rotation aliases are not counted as backend outages',
      terminalEvents.filter(event => event.model === 'sota').every(event => event.outcome === 'rejected'));
    const telemetryText = fs.readFileSync(telemetryPath, 'utf8');
    check('Version 2 telemetry has one terminal result per request and excludes prompts',
      terminalEvents.length === beforeCounters.requests && new Set(terminalIds).size === terminalIds.length &&
      !['UTF8 ', 'SSE_FRAGMENT', 'BACKPRESSURE', 'UPSTREAM401', 'CANCEL'].some(marker => telemetryText.includes(marker)),
      `events=${terminalEvents.length} requests=${beforeCounters.requests} unique=${new Set(terminalIds).size}`);
    check('Terminal telemetry covers success, rejection, timeout, cancellation, stream error and local unavailability',
      ['success', 'rejected', 'timeout', 'cancelled', 'stream_error', 'local_unavailable'].every(outcome =>
        terminalEvents.some(event => event.outcome === outcome)),
      [...new Set(terminalEvents.map(event => event.outcome))].join(','));

    await stopProxy(proxy);
    proxyExited = false;
    proxy = spawnProxy();
    await new Promise(resolve => setTimeout(resolve, 500));
    const afterRestart = await request({ method: 'GET', urlPath: '/stats', content: undefined });
    let afterCounters = {};
    try { afterCounters = JSON.parse(afterRestart.body); } catch {}
    const counterKeys = ['requests', 'ok', 'rejected', 'timeout', 'cancelled', 'stream_error', 'local_unavailable',
      'fallbacks', 'rate_limited', 'pool_errors', 'first_event_timeouts', 'unauthorized'];
    check('Version 2 terminal counters survive a proxy restart without replaying old V1 successes',
      afterRestart.status === 200 && counterKeys.every(key => afterCounters[key] === beforeCounters[key]) &&
      afterCounters.telemetry_version === 2,
      `requests=${beforeCounters.requests}->${afterCounters.requests}, v=${afterCounters.telemetry_version}`);
  } finally {
    await stopProxy(proxy);
    mock.closeAllConnections();
    await new Promise(resolve => mock.close(resolve));
    try { await new Promise(resolve => poolFrontMock.close(resolve)); } catch {}
    try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
  }
  if (fail) console.log('\n--- proxy log ---\n' + proxyLog.slice(-3000));
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
}

main();
