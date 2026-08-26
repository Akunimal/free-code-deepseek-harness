import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('.', import.meta.url).pathname.replace(/^\/[A-Za-z]:/, match => match.slice(1));
const prune = join(root, 'prune-runtime-optional-providers.mjs');
const verify = join(root, 'verify-runtime-closure.mjs');

function fixture() {
  const stage = mkdtempSync(join(tmpdir(), 'freecode-runtime-closure-'));
  mkdirSync(join(stage, 'node_modules', '@openai', 'codex-win32-x64'), { recursive: true });
  mkdirSync(join(stage, 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64'), { recursive: true });
  mkdirSync(join(stage, 'packages', 'subagent', 'subagent-codex'), { recursive: true });
  writeFileSync(join(stage, 'package.json'), '{}');
  return stage;
}

test('prune removes optional native provider payloads and the closure gate passes', () => {
  const stage = fixture();
  try {
    const result = spawnSync(process.execPath, [prune, stage], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(stage, 'node_modules', '@openai', 'codex-win32-x64')), false);
    assert.equal(existsSync(join(stage, 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64')), false);
    assert.equal(existsSync(join(stage, 'packages', 'subagent', 'subagent-codex')), false);
    const verified = spawnSync(process.execPath, [verify, stage], { encoding: 'utf8', windowsHide: true });
    assert.equal(verified.status, 0, verified.stderr);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('closure gate rejects a forbidden provider before pruning', () => {
  const stage = fixture();
  try {
    const result = spawnSync(process.execPath, [verify, stage], { encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /forbidden optional providers/);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('closure gate rejects development tooling before pruning', () => {
  const stage = mkdtempSync(join(tmpdir(), 'freecode-runtime-dev-closure-'));
  try {
    mkdirSync(join(stage, 'node_modules', 'vite'), { recursive: true });
    writeFileSync(join(stage, 'package.json'), '{}');
    const result = spawnSync(process.execPath, [verify, stage], { encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /node_modules[\\/]vite/);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});
