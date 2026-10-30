'use strict';

const assert = require('node:assert/strict');
const beforeImport = ['uncaughtException', 'unhandledRejection', 'exit'].map(name => process.listenerCount(name));
require('./watchdog');
assert.deepEqual(['uncaughtException', 'unhandledRejection', 'exit'].map(name => process.listenerCount(name)), beforeImport,
  'importing supervisor helpers must not attach process-wide lifecycle handlers');
const {
  restartDelay,
  heartbeatIsFresh,
  processDescriptor,
  sameExecutable,
  commandLineContains,
  creationTimeMatches
} = require('./supervisor-core');

assert.equal(restartDelay(0, () => 0), 2000, 'backoff never falls below two seconds');
assert.ok(restartDelay(1, () => 0.5) > restartDelay(0, () => 0.5), 'repeated fast failures back off');
assert.equal(restartDelay(100, () => 1), 60000, 'backoff caps at one minute');

const now = Date.now();
assert.equal(heartbeatIsFresh({ updatedAt: new Date(now - 19_000).toISOString() }, now), true);
assert.equal(heartbeatIsFresh({ updatedAt: new Date(now - 21_000).toISOString() }, now), false);
assert.equal(heartbeatIsFresh({ updatedAt: new Date(now + 10_000).toISOString() }, now), false);

const descriptor = processDescriptor(1234, 'C:/gateway/runtime/node.exe', ['C:/gateway/scripts/watchdog.js'], now);
assert.equal(descriptor.pid, 1234);
assert.equal(sameExecutable('c:\\gateway\\runtime\\node.exe', descriptor.executable), true);
assert.equal(commandLineContains('"C:\\gateway\\runtime\\node.exe" "C:\\gateway\\scripts\\watchdog.js"', descriptor.args), true);
assert.equal(commandLineContains('"C:\\gateway\\runtime\\node.exe" other.js', descriptor.args), false,
  'a matching PID/executable with different arguments is not owned');
assert.equal(creationTimeMatches(now + 1, descriptor.startedAt), true);
assert.equal(creationTimeMatches(now + 2, descriptor.startedAt), false,
  'a reused PID with a later creation time is not owned');

console.log('PASS supervisor backoff, heartbeat freshness, and process identity checks');
