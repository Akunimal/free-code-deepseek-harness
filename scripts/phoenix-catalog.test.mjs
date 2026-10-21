import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { extractPhoenixCatalog, verifyPhoenixCatalog } from './phoenix-catalog.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\//, '').replaceAll('%20', ' ');

test('Phoenix ships only the pinned keyless/free provider slice in deterministic upstream order', () => {
  const upstream = readFileSync(join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml'), 'utf8');
  const catalog = extractPhoenixCatalog(upstream);
  assert.deepEqual(catalog.providerIds, ['pollinations', 'llm7', 'ovh', 'kilo']);
  assert.equal(catalog.modelIds[0], 'auto');
  assert.ok(catalog.modelIds.includes('pollinations/openai-fast'));
  assert.ok(!catalog.modelIds.includes('pollinations/gpt-oss-20b'));
  assert.ok(!catalog.modelIds.includes('llm7/qwen3-235b'));
  assert.ok(!catalog.modelIds.includes('kilo/minimax/minimax-m3:free'));
  assert.doesNotMatch(catalog.text, /\[\[embedder\]\]|\[\[transcriber\]\]/);
  assert.match(catalog.text, /auth\s*=\s*"none"/);
  assert.doesNotMatch(catalog.text, /api[_-]?key\s*=\s*["'][^"']{20,}["']/i);
});

test('checked-in Phoenix catalog exactly matches the pinned source slice', () => {
  assert.equal(verifyPhoenixCatalog(root), true);
});

test('checked-in model IDs contain Auto and only enabled canonical routes', () => {
  const ids = JSON.parse(readFileSync(join(root, 'apps', 'shell', 'resources', 'phoenix', 'phoenix-model-ids.json'), 'utf8'));
  assert.equal(ids[0], 'auto');
  assert.ok(ids.every((id) => id === 'auto' || /^(pollinations|llm7|ovh|kilo)\/.+/.test(id)));
  assert.equal(new Set(ids).size, ids.length);
});
