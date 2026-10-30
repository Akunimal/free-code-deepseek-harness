'use strict';
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const original = childProcess.execFileSync;
let calls = 0;
let failure = 'ETIMEDOUT';
childProcess.execFileSync = () => {
  calls++;
  if (calls === 1) throw Object.assign(new Error('simulated identity lookup failure'), { code: failure });
  return JSON.stringify({ startedAt: '2026-10-22T20:00:00.000Z', creationTicks: '639283008000000000' });
};
try {
  const { captureProcessCreation } = require('./process-identity');
  assert.equal(captureProcessCreation(123).creationTicks, '639283008000000000');
  assert.equal(calls, 2, 'cold root timeout retries immediately');
  calls = 0;
  assert.throws(() => captureProcessCreation(123, 456), /lookup failure/);
  assert.equal(calls, 1, 'child identity errors stay bounded');
  calls = 0; failure = 'EPERM';
  assert.throws(() => captureProcessCreation(123), /lookup failure/);
  assert.equal(calls, 1, 'permanent identity failure is never weakened');
  console.log('PASS cold root identity timeout retries once; child/permanent failures remain strict');
} finally { childProcess.execFileSync = original; }
