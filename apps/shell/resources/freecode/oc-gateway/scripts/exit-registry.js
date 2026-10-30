'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteJson } = require('./runtime-config');
const TOKEN = /^[a-f0-9]{32}$/;
const root = home => path.join(home, 'data', 'exit-attempts');
function location(home, token) {
  if (!TOKEN.test(token)) throw new Error('invalid attempt token');
  return path.join(root(home), token);
}
function read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function createAttempt(home, token, model, ttlMs) {
  const directory = location(home, token);
  const staging = `${directory}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.mkdirSync(staging, { recursive: true });
  try {
    atomicWriteJson(path.join(staging, 'lease.json'), { model, expiresAt: Date.now() + ttlMs });
    fs.renameSync(staging, directory);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
function finishAttempt(home, token, result) {
  const directory = location(home, token);
  const exit = read(path.join(directory, 'exit.json'));
  if (!exit?.address) {
    // No attributed tunnel exists: retire the lease immediately, including when
    // the front is down and cannot collect feedback. Late authentication fails.
    fs.rmSync(directory, { recursive: true, force: true });
    return null;
  }
  atomicWriteJson(path.join(directory, 'feedback.json'), {
    outcome: result.outcome, status: result.status, upstreamResponded: result.upstreamResponded === true, transportFailure: result.transportFailure === true, retryAfterMs: result.retryAfterMs || 0, at: Date.now()
  });
  return exit;
}

class ExitRegistry {
  constructor(home, { clock = Date.now } = {}) {
    this.home = home;
    this.clock = clock;
    this.file = path.join(home, 'data', 'exit-state.json');
    const state = read(this.file);
    this.state = state?.version === 1 && state.exits && typeof state.exits === 'object' ? state : { version: 1, exits: {} };
    this.state.completed ||= {};
    this.pins = new Map();
  }
  save() { atomicWriteJson(this.file, this.state); }
  entry(address) {
    return this.state.exits[address] ||= { transportFailures: 0, transportUntil: 0, models: {} };
  }
  lease(token) {
    if (!TOKEN.test(token)) return null;
    const directory = location(this.home, token);
    if (fs.existsSync(path.join(directory, 'feedback.json'))) return null;
    const lease = read(path.join(directory, 'lease.json'));
    if (!lease || lease.expiresAt <= this.clock() || typeof lease.model !== 'string') return null;
    return lease;
  }
  until(address, model) {
    const entry = this.state.exits[address];
    return Math.max(entry?.transportUntil || 0, model ? entry?.models?.[model]?.quotaUntil || 0 : 0);
  }
  pin(token) {
    return this.pins.get(token) || read(path.join(location(this.home, token), 'exit.json'))?.address;
  }
  connected(token, address) {
    const now = this.clock();
    const entry = this.entry(address);
    entry.connectedAt = now;
    if (token) {
      this.pins.set(token, address);
      atomicWriteJson(path.join(location(this.home, token), 'exit.json'), { address, at: now });
    }
    this.save();
  }
  transportFailed(address, persist = true) {
    const entry = this.entry(address);
    entry.transportFailures++;
    entry.transportUntil = this.clock() + Math.min(30 * 60_000, 5000 * 2 ** Math.min(9, entry.transportFailures - 1));
    if (persist) this.save();
    return entry.transportUntil;
  }
  collect() {
    let directories;
    try { directories = fs.readdirSync(root(this.home)); } catch { return; }
    for (const token of directories.filter(value => TOKEN.test(value)).slice(0, 1024)) {
      const directory = location(this.home, token);
      const lease = read(path.join(directory, 'lease.json'));
      const feedback = read(path.join(directory, 'feedback.json'));
      const exit = read(path.join(directory, 'exit.json'));
      if (feedback && lease && exit?.address && !this.state.completed[token]) {
        const entry = this.entry(exit.address);
        const model = entry.models[lease.model] ||= {};
        if (feedback.upstreamResponded) {
          model.upstreamRespondedAt = feedback.at;
          entry.transportFailures = 0;
          entry.transportUntil = 0;
        } else if (feedback.transportFailure && feedback.outcome !== 'cancelled') {
          this.transportFailed(exit.address, false);
        }
        if (feedback.upstreamResponded && feedback.outcome === 'quota' && feedback.status === 429) {
          model.quotaUntil = Math.max(model.quotaUntil || 0, feedback.at + (feedback.retryAfterMs > 0 ? feedback.retryAfterMs : 60_000));
          model.quotaResetKnown = feedback.retryAfterMs > 0;
        }
        if (feedback.outcome === 'success') model.generationConfirmedAt = feedback.at;
        this.state.completed[token] = feedback.at;
        const completed = Object.keys(this.state.completed);
        for (const old of completed.slice(0, Math.max(0, completed.length - 4096))) delete this.state.completed[old];
        this.save(); // Commit before removing feedback; replay after a crash is idempotent.
      }
      if (feedback || !lease || lease.expiresAt <= this.clock()) {
        this.pins.delete(token);
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  }
}

module.exports = { ExitRegistry, createAttempt, finishAttempt, TOKEN };
