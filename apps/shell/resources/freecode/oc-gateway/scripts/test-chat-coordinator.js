'use strict';

const assert = require('node:assert/strict');
const { ChatCoordinator, CircuitRegistry, retryAfterMs } = require('./chat-coordinator');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testSequentialModelAndAttemptLimit() {
  const seen = [];
  let active = 0;
  let peak = 0;
  const coordinator = new ChatCoordinator({
    maxAttempts: 4,
    directTimeoutMs: 100,
    poolTimeoutMs: 100,
    transportCooldownMs: 1,
    localCooldownMs: 1,
    random: () => 0,
    executeAttempt: async attempt => {
      active++;
      peak = Math.max(peak, active);
      seen.push({ route: attempt.route, model: attempt.model, payload: attempt.payload, attemptId: attempt.attemptId });
      await wait(1);
      active--;
      return seen.length === 1
        ? { outcome: 'transport_local', status: 502 }
        : { outcome: 'success', status: 200 };
    }
  });
  const { promise } = coordinator.submit({ requestId: 'same-model', model: 'opencode2api/alpha', payload: 'original', deadline: Date.now() + 1000 });
  const result = await promise;
  assert.equal(result.outcome, 'success');
  assert.deepEqual(seen.map(x => x.route), ['direct', 'pool']);
  assert.ok(seen.every(x => x.model === 'opencode2api/alpha' && x.payload === 'original'));
  assert.equal(new Set(seen.map(x => x.attemptId)).size, seen.length);
  assert.equal(peak, 1, 'attempts from a single request must never overlap');

  const failed = [];
  const limited = new ChatCoordinator({
    maxAttempts: 4,
    directTimeoutMs: 100,
    poolTimeoutMs: 100,
    transportCooldownMs: 1,
    localCooldownMs: 1,
    random: () => 0,
    executeAttempt: async attempt => {
      failed.push(attempt);
      return { outcome: 'transport_local', status: 502 };
    }
  });
  const response = await limited.submit({ requestId: 'four-attempts', model: 'alpha', payload: 'same', deadline: Date.now() + 1000 }).promise;
  assert.notEqual(response.outcome, 'success');
  assert.equal(failed.length, 4, 'one request must not exceed four backend attempts');
  assert.ok(failed.every(x => x.model === 'alpha' && x.payload === 'same'));
  console.log('PASS same model/payload, sequential attempts, and four-attempt ceiling');
}

async function testAdmissionAndQueuedBudget() {
  let release;
  let active = 0;
  let peak = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const coordinator = new ChatCoordinator({
    maxActive: 2,
    maxQueued: 4,
    executeAttempt: async () => {
      active++;
      peak = Math.max(peak, active);
      await gate;
      active--;
      return { outcome: 'success' };
    }
  });
  const submitted = Array.from({ length: 6 }, (_, index) => coordinator.submit({
    requestId: `admission-${index}`, model: 'alpha', deadline: Date.now() + 1000
  }));
  await wait(5);
  assert.equal(coordinator.active, 2);
  assert.equal(coordinator.queue.length, 4);
  const overflow = await coordinator.submit({ requestId: 'overflow', model: 'alpha', deadline: Date.now() + 1000 }).promise;
  assert.equal(overflow.outcome, 'queue_full');
  release();
  const settled = await Promise.all(submitted.map(x => x.promise));
  assert.ok(settled.every(x => x.outcome === 'success'));
  assert.equal(peak, 2, 'global active request ceiling must be enforced');

  let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  const timed = new ChatCoordinator({ maxActive: 1, maxQueued: 1, executeAttempt: async () => {
    await blocked;
    return { outcome: 'success' };
  } });
  const activeRequest = timed.submit({ requestId: 'active', model: 'alpha', deadline: Date.now() + 500 });
  const startedAt = Date.now();
  const queued = timed.submit({ requestId: 'queued-deadline', model: 'alpha', deadline: Date.now() + 30 });
  const expired = await queued.promise;
  assert.equal(expired.outcome, 'timeout');
  assert.ok(Date.now() - startedAt < 150, 'queue time consumes the request budget');
  unblock();
  await activeRequest.promise;
  console.log('PASS active/queue bounds, queue-full 503, and budget expiry while queued');
}

function testCircuitAndRetryAfter() {
  let now = 1_000;
  const circuits = new CircuitRegistry({ clock: () => now });
  const initial = circuits.acquire('backend:pool:alpha');
  assert.equal(initial.allowed, true);
  circuits.fail(initial, 50);
  assert.equal(circuits.acquire('backend:pool:alpha').allowed, false);
  now += 50;
  const probe = circuits.acquire('backend:pool:alpha');
  assert.equal(probe.allowed, true);
  assert.equal(probe.probe, true);
  assert.equal(circuits.acquire('backend:pool:alpha').allowed, false);
  circuits.success(probe);
  assert.equal(circuits.acquire('backend:pool:alpha').allowed, true);

  assert.equal(retryAfterMs('3', 0), 3000);
  assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:05 GMT', 1000), 4000);
  assert.equal(retryAfterMs('not-a-date', 0), 0);
  console.log('PASS per-route/model half-open circuit and Retry-After seconds/date parsing');
}

async function main() {
  for (const [outcome, status] of [['quota', 429], ['provider_rejected', 403], ['model_error', 400], ['client_error', 401], ['client_error', 418], ['transport_egress', 500], ['transport_egress', 503]]) {
    const seen = [];
    const rotations = [];
    const recover = new ChatCoordinator({ random: () => 0, rotate: async (kind, job, result) => rotations.push({ kind, route: result.route }), executeAttempt: async attempt => {
      seen.push(attempt);
      return seen.length === 3 ? { outcome: 'success', status: 200 } : { outcome, status, retryAfterMs: 15678000 };
    } });
    const recovered = await recover.submit({ requestId: `recover-${status}`, model: 'alpha', payload: 'unchanged', deadline: Date.now() + 4000 }).promise;
    assert.equal(recovered.outcome, 'success', `recover after HTTP ${status}`);
    assert.deepEqual(seen.map(attempt => attempt.route), ['direct', 'pool', 'pool']);
    assert.ok(seen.every(attempt => attempt.model === 'alpha' && attempt.payload === 'unchanged'));
    assert.deepEqual(rotations.map(rotation => rotation.route), ['direct', 'pool'], 'every non-200 response preserves its route for intelligent pool rotation');
  }
  let count = 0;
  const persistent = new ChatCoordinator({ random: () => 0, executeAttempt: async () => {
    count++;
    return count <= 4 ? { outcome: 'quota', status: 429, retryAfterMs: 15678000 } : { outcome: 'success', status: 200 };
  } });
  const failed = await persistent.submit({ requestId: 'quota-one', model: 'alpha', deadline: Date.now() + 4000 }).promise;
  assert.equal(failed.status, 429);
  assert.equal(count, 4);
  const next = await persistent.submit({ requestId: 'quota-two', model: 'alpha', deadline: Date.now() + 1000 }).promise;
  assert.equal(next.outcome, 'success');
  assert.equal(count, 5, 'a new request must reach a fresh pool exit rather than replay cached quota');
  console.log('PASS long direct quota reaches pool; all pre-content HTTP errors rotate; pool rejection never blocks subsequent recovery');
  await testSequentialModelAndAttemptLimit();
  let recoveryAttempts = 0;
  const recovery = new ChatCoordinator({ localCooldownMs: 400, random: () => 0, executeAttempt: async () => {
    recoveryAttempts++;
    return recoveryAttempts === 4 ? { outcome: 'success' } : { outcome: 'transport_local', status: 502 };
  } });
  const recovered = await recovery.submit({ requestId: 'cooldown-does-not-spend-attempts', model: 'alpha', directAvailable: false, deadline: Date.now() + 5000 }).promise;
  assert.equal(recovered.outcome, 'success');
  assert.equal(recoveryAttempts, 4);
  console.log('PASS cooldown waits do not consume backend attempts and a recovered backend is retried');
  await testAdmissionAndQueuedBudget();
  testCircuitAndRetryAfter();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
