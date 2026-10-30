'use strict';

function restartDelay(failureIndex, random = Math.random) {
  const index = Math.max(0, Math.floor(Number(failureIndex) || 0));
  const base = Math.min(60_000, 2_000 * (2 ** Math.min(index, 8)));
  const sample = Math.max(0, Math.min(1, Number(random()) || 0));
  const jittered = Math.round(base * (0.85 + sample * 0.3));
  return Math.max(2_000, Math.min(60_000, jittered));
}

function heartbeatIsFresh(heartbeat, now = Date.now(), maxAgeMs = 20_000) {
  const updatedAt = Date.parse(heartbeat?.updatedAt || '');
  return Number.isFinite(updatedAt) && updatedAt <= now + 2_000 && now - updatedAt <= maxAgeMs;
}

function processDescriptor(pid, executable, args, startedAt) {
  return {
    pid: Number(pid) || null,
    executable: String(executable || ''),
    args: Array.isArray(args) ? args.map(String) : [],
    startedAt: new Date(startedAt).toISOString()
  };
}

function sameExecutable(actual, expected) {
  return String(actual || '').replaceAll('/', '\\').toLowerCase() ===
    String(expected || '').replaceAll('/', '\\').toLowerCase();
}

function commandLineContains(commandLine, args) {
  const normalized = String(commandLine || '').replaceAll('/', '\\').toLowerCase();
  return Array.isArray(args) && args.every(arg =>
    !String(arg).trim() || normalized.includes(String(arg).replaceAll('/', '\\').toLowerCase()));
}

function creationTimeMatches(actualMs, expectedIso, toleranceMs = 1) {
  const expectedMs = Date.parse(expectedIso || '');
  return Number.isFinite(actualMs) && Number.isFinite(expectedMs) &&
    Math.abs(actualMs - expectedMs) <= toleranceMs;
}

module.exports = {
  restartDelay,
  heartbeatIsFresh,
  processDescriptor,
  sameExecutable,
  commandLineContains,
  creationTimeMatches
};
