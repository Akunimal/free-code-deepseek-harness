'use strict';

function retryAfterMs(value, now = Date.now()) {
  if (value === undefined || value === null || value === '') return 0;
  const text = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.ceil(Number(text) * 1000));
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

class CircuitRegistry {
  constructor({ clock = Date.now } = {}) {
    this.clock = clock;
    this.states = new Map();
  }

  acquire(key) {
    const now = this.clock();
    const state = this.states.get(key);
    if (!state) return { allowed: true, key, probe: false };
    if (state.openUntil > now) return {
      allowed: false, key, retryAfterMs: state.openUntil - now,
      outcome: state.outcome || 'local_unavailable', status: state.status || 503,
      retryAfter: state.retryAfter
    };
    if (state.probeInFlight) return { allowed: false, key, retryAfterMs: 1000, outcome: 'local_unavailable', status: 503 };
    state.probeInFlight = true;
    return { allowed: true, key, probe: true };
  }

  success(token) {
    if (token) this.states.delete(token.key);
  }

  fail(token, cooldownMs, failure = {}) {
    if (!token) return;
    this.states.set(token.key, {
      openUntil: this.clock() + Math.max(1, cooldownMs),
      probeInFlight: false,
      outcome: failure.outcome,
      status: failure.status,
      retryAfter: failure.retryAfter
    });
  }

  release(token) {
    if (!token?.probe) return;
    const state = this.states.get(token.key);
    if (state) state.probeInFlight = false;
  }

  snapshot() {
    const now = this.clock();
    return Object.fromEntries([...this.states].map(([key, state]) => [key, {
      remainingMs: Math.max(0, state.openUntil - now),
      probeInFlight: state.probeInFlight
    }]));
  }
}

function abortableDelay(ms, signal) {
  if (ms <= 0) return Promise.resolve(true);
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(true), ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

class ChatCoordinator {
  constructor({
    executeAttempt,
    rotate = async () => {},
    maxActive = 2,
    maxQueued = 4,
    maxAttempts = 4,
    directTimeoutMs = 30_000,
    poolTimeoutMs = 40_000,
    localCooldownMs = 500,
    transportCooldownMs = 2_000,
    slowCooldownMs = 5_000,
    rejectedCooldownMs = 30_000,
    random = Math.random,
    clock = Date.now
  }) {
    if (typeof executeAttempt !== 'function') throw new TypeError('executeAttempt is required');
    this.executeAttempt = executeAttempt;
    this.rotate = rotate;
    this.maxActive = maxActive;
    this.maxQueued = maxQueued;
    this.maxAttempts = maxAttempts;
    this.directTimeoutMs = directTimeoutMs;
    this.poolTimeoutMs = poolTimeoutMs;
    this.localCooldownMs = localCooldownMs;
    this.transportCooldownMs = transportCooldownMs;
    this.slowCooldownMs = slowCooldownMs;
    this.rejectedCooldownMs = rejectedCooldownMs;
    this.random = random;
    this.clock = clock;
    this.active = 0;
    this.queue = [];
    this.circuits = new CircuitRegistry({ clock });
  }

  submit(job) {
    const controller = new AbortController();
    const item = { job, controller, settled: false, active: false, timer: null, resolve: null };
    const promise = new Promise(resolve => { item.resolve = resolve; });
    const settle = result => {
      if (item.settled) return;
      item.settled = true;
      if (item.timer) clearTimeout(item.timer);
      item.resolve(result);
    };
    item.settle = settle;
    item.job.onFirstContent = () => {
      if (item.timer) clearTimeout(item.timer);
      item.timer = null;
      item.firstContent = true;
    };
    item.cancel = () => {
      controller.abort();
      const index = this.queue.indexOf(item);
      if (index >= 0) this.queue.splice(index, 1);
      settle({ outcome: 'cancelled', status: 499, requestId: job.requestId });
      this.pump();
    };

    const remaining = job.deadline - this.clock();
    if (remaining <= 0) {
      settle({ outcome: 'timeout', status: 504, requestId: job.requestId });
      return { promise, cancel: item.cancel, queued: false };
    }
    item.timer = setTimeout(() => {
      controller.abort();
      const index = this.queue.indexOf(item);
      if (index >= 0) this.queue.splice(index, 1);
      settle({ outcome: 'timeout', status: 504, requestId: job.requestId });
      this.pump();
    }, remaining);

    if (this.active < this.maxActive) {
      this.start(item);
      return { promise, cancel: item.cancel, queued: false };
    }
    if (this.queue.length >= this.maxQueued) {
      settle({ outcome: 'queue_full', status: 503, retryAfter: 2, requestId: job.requestId });
      return { promise, cancel: item.cancel, queued: false };
    }
    this.queue.push(item);
    return { promise, cancel: item.cancel, queued: true };
  }

  pump() {
    while (this.active < this.maxActive && this.queue.length) {
      const item = this.queue.shift();
      if (!item.settled) this.start(item);
    }
  }

  start(item) {
    if (item.settled) return;
    item.active = true;
    this.active++;
    void this.run(item.job, item.controller.signal).then(item.settle, error => {
      item.settle({ outcome: 'local_unavailable', status: 503, message: error.message, requestId: item.job.requestId });
    }).finally(() => {
      item.active = false;
      this.active--;
      this.pump();
    });
  }

  async run(job, signal) {
    const tried = { direct: false, cloudflare: false, vercel: false };
    let attemptCount = 0;
    let last = null;
    let routeCursor = 0;
    let blocked = [];
    while (attemptCount < this.maxAttempts && !signal.aborted) {
      const remaining = job.deadline - this.clock();
      if (remaining <= 0) return { outcome: 'timeout', status: 504, requestId: job.requestId };
      const route = job.routes
        ? job.routes[routeCursor++ % job.routes.length]
        : !tried.direct && job.directAvailable !== false ? 'direct'
          : !tried.cloudflare && job.cloudflareAvailable === true ? 'cloudflare'
            : !tried.vercel && job.vercelAvailable === true ? 'vercel' : 'pool';
      if (!route) return last || { outcome: 'local_unavailable', status: 503, requestId: job.requestId };
      if (route === 'direct') tried.direct = true;
      if (route === 'cloudflare') tried.cloudflare = true;
      if (route === 'vercel') tried.vercel = true;

      const key = `opencode2api:${route}:${job.model}`;
      const token = this.circuits.acquire(key);
      if (!token.allowed) {
        last = {
          outcome: token.outcome || 'local_unavailable', status: token.status || 503, route,
          retryAfter: token.retryAfter || String(Math.max(1, Math.ceil(token.retryAfterMs / 1000))),
          retryAfterMs: token.retryAfterMs
        };
        if (job.routes) {
          blocked.push(token.retryAfterMs);
          if (blocked.length < job.routes.length) continue;
          const waitMs = Math.min(...blocked);
          blocked = [];
          if (waitMs >= remaining || !await abortableDelay(waitMs, signal)) break;
          continue;
        }
        if (route === 'direct' || route === 'cloudflare' || route === 'vercel') continue;
        if (token.retryAfterMs >= remaining) break;
        if (!await abortableDelay(token.retryAfterMs, signal)) break;
        continue;
      }

      blocked = [];
      attemptCount++;
      const attemptId = `${job.requestId}:${attemptCount}`;
      const configuredTimeout = route === 'direct'
        ? (job.directTimeoutMs || this.directTimeoutMs)
        : (job.poolTimeoutMs || this.poolTimeoutMs);
      const timeoutMs = Math.max(1, Math.min(configuredTimeout, remaining));
      let result;
      try {
        result = await this.executeAttempt({ ...job, route, attemptId, timeoutMs, signal });
      } catch (error) {
        result = { outcome: 'transport_local', status: 502, message: error.message };
      }
      if (signal.aborted) {
        this.circuits.release(token);
        return { outcome: 'cancelled', status: 499, requestId: job.requestId };
      }
      if (!result || result.outcome === 'success') {
        this.circuits.success(token);
        return { outcome: 'success', status: result?.status || 200, route, attemptId, requestId: job.requestId };
      }
      if (result.committed || result.outcome === 'stream_error') {
        this.circuits.fail(token, this.transportCooldownMs, { outcome: 'stream_error', status: 502 });
        return { ...result, outcome: 'stream_error', route, attemptId, requestId: job.requestId };
      }

      last = { ...result, route, attemptId, requestId: job.requestId };
      if (result.outcome === 'quota' && route !== 'pool') {
        const waitMs = result.retryAfterMs || 0;
        this.circuits.fail(token, waitMs || this.rejectedCooldownMs, result);
      } else if (result.outcome === 'transport_local') {
        this.circuits.fail(token, this.localCooldownMs, { outcome: 'local_unavailable', status: 503 });
      } else {
        // The pool is many independent exits. A rejection or Retry-After from
        // one exit must never quarantine every exit or the next request.
        this.circuits.success(token);
      }
      if (route !== 'cloudflare' && route !== 'vercel' && ((Number.isInteger(result.status) && result.status !== 200) || (route === 'pool' && result.outcome !== 'transport_local'))) {
        const kind = ['quota', 'provider_rejected', 'model_error', 'slow'].includes(result.outcome)
          ? result.outcome : result.outcome === 'client_error' ? 'provider_rejected' : 'transport';
        await this.rotate(kind, job, { ...result, route }, signal);
      }

      if (attemptCount >= this.maxAttempts) break;
      const delay = Math.min(250 + Math.floor(this.random() * 251), Math.max(0, job.deadline - this.clock()));
      if (delay > 0 && !await abortableDelay(delay, signal)) break;
    }
    if (signal.aborted) return { outcome: 'cancelled', status: 499, requestId: job.requestId };
    if (job.deadline <= this.clock()) return { outcome: 'timeout', status: 504, requestId: job.requestId };
    return last || { outcome: 'local_unavailable', status: 503, requestId: job.requestId };
  }
}

module.exports = { ChatCoordinator, CircuitRegistry, retryAfterMs };
