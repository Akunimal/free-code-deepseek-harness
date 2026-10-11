import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('.', import.meta.url).pathname.replace(/^\/[A-Za-z]:/, match => match.slice(1));
const prune = join(root, 'prune-runtime-optional-providers.mjs');
const verify = join(root, 'verify-runtime-closure.mjs');
const materialize = join(root, 'materialize-runtime.mjs');
const copyStage = join(root, 'copy-runtime-stage.mjs');
const verifyManifest = join(root, 'verify-runtime-manifest.mjs');

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

test('runtime materializer flattens workspace links without recursively scanning native trees', () => {
  const stage = mkdtempSync(join(tmpdir(), 'freecode-runtime-materialize-'));
  try {
    writeFileSync(join(stage, 'package.json'), '{}');
    mkdirSync(join(stage, 'apps', 'fixture', 'node_modules', 'native-package'), { recursive: true });
    mkdirSync(join(stage, 'apps', 'fixture', '.bin'), { recursive: true });
    writeFileSync(join(stage, 'apps', 'fixture', 'package.json'), JSON.stringify({ name: '@deepseek-ai/fixture', version: '0.0.0' }));
    writeFileSync(join(stage, 'apps', 'fixture', 'index.js'), 'module.exports = true;\n');
    writeFileSync(join(stage, 'apps', 'fixture', 'node_modules', 'native-package', 'addon.node'), 'fixture');
    writeFileSync(join(stage, 'apps', 'fixture', '.bin', 'fixture.cmd'), 'fixture');
    mkdirSync(join(stage, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(stage, 'node_modules', '.bin', 'fixture.cmd'), 'fixture');

    const result = spawnSync(process.execPath, [materialize, stage], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /copied 1 workspace packages/);
    assert.equal(existsSync(join(stage, 'node_modules', '@deepseek-ai', 'fixture', 'index.js')), true);
    assert.equal(existsSync(join(stage, 'apps', 'fixture', 'node_modules')), false);
    assert.equal(existsSync(join(stage, 'apps', 'fixture', '.bin')), false);
    assert.equal(existsSync(join(stage, 'node_modules', '.bin')), false);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('runtime stage copy excludes pnpm virtual-store metadata from the shipped closure', () => {
  const stage = mkdtempSync(join(tmpdir(), 'freecode-runtime-copy-stage-'));
  const destination = mkdtempSync(join(tmpdir(), 'freecode-runtime-copy-dest-'));
  rmSync(destination, { recursive: true, force: true });
  try {
    writeFileSync(join(stage, 'package.json'), '{}');
    mkdirSync(join(stage, 'node_modules', '.pnpm', 'dev-only'), { recursive: true });
    mkdirSync(join(stage, 'node_modules', 'runtime-package'), { recursive: true });
    writeFileSync(join(stage, 'node_modules', '.pnpm', 'dev-only', 'package.json'), '{}');
    writeFileSync(join(stage, 'node_modules', '.modules.yaml'), 'dev metadata');
    writeFileSync(join(stage, 'node_modules', 'runtime-package', 'index.js'), 'module.exports = true;\n');

    const result = spawnSync(process.execPath, [copyStage, stage, destination], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(destination, 'node_modules', 'runtime-package', 'index.js')), true);
    assert.equal(existsSync(join(destination, 'node_modules', '.pnpm')), false);
    assert.equal(existsSync(join(destination, 'node_modules', '.modules.yaml')), false);
  } finally {
    rmSync(stage, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

test('runtime stage copy excludes non-runtime benchmark workspace dependencies', () => {
  const stage = mkdtempSync(join(tmpdir(), 'freecode-runtime-benchmark-copy-'));
  const destination = mkdtempSync(join(tmpdir(), 'freecode-runtime-benchmark-dest-'));
  rmSync(destination, { recursive: true, force: true });
  try {
    writeFileSync(join(stage, 'package.json'), '{}');
    mkdirSync(join(stage, 'benchmarks', 'node_modules', '@deepseek-ai', 'cordis'), { recursive: true });
    writeFileSync(join(stage, 'benchmarks', 'README.md'), 'benchmark source');
    writeFileSync(join(stage, 'benchmarks', 'node_modules', '@deepseek-ai', 'cordis', 'package.json'), '{}');

    const result = spawnSync(process.execPath, [copyStage, stage, destination], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(destination, 'benchmarks', 'README.md')), true);
    assert.equal(existsSync(join(destination, 'benchmarks', 'node_modules')), false);
  } finally {
    rmSync(stage, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});

test('runtime manifest gate rejects a literal escaped newline after the JSON object', () => {
  const manifest = mkdtempSync(join(tmpdir(), 'freecode-runtime-manifest-'));
  const manifestPath = join(manifest, 'runtime-manifest.json');
  try {
    writeFileSync(manifestPath, '{"version":"0.1.3-alpha.1","cli":"dsh/apps/cli/lib/bin.js","install":"core-allowlist","optionalProviders":"external-only"}\\n');
    const result = spawnSync(process.execPath, [verifyManifest, manifestPath], { encoding: 'utf8', windowsHide: true });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /invalid JSON/);
  } finally {
    rmSync(manifest, { recursive: true, force: true });
  }
});
