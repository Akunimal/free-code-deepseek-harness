import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { extractPhoenixCatalog, phoenixModelQualityScore, verifyPhoenixCatalog } from './phoenix-catalog.mjs';

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

test('Kilo exposes only its direct no-auth non-Nemotron free routes, ranked by quality before speed', () => {
  const upstream = readFileSync(join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml'), 'utf8');
  const catalog = extractPhoenixCatalog(upstream);
  const kiloIds = catalog.modelIds.filter((id) => id.startsWith('kilo/'));
  assert.deepEqual(kiloIds, [
    'kilo/minimax/minimax-m3.1-flash:free',
    'kilo/poolside/laguna-s-2.1:free',
    'kilo/dots-studio/dots-3-note-preview:free',
  ]);
  assert.doesNotMatch(catalog.text, /nemotron|kilo-auto\/free|openrouter\/free/i);
  assert.doesNotMatch(JSON.stringify(catalog.modelIds), /nemotron|kilo\/kilo-auto\/free|kilo\/openrouter\/free/i);
  const kiloBlock = catalog.text.split('[[provider]]').find((block) => /^\s*id\s*=\s*"kilo"\s*$/m.test(block));
  assert.ok(kiloBlock, 'curated no-auth Kilo provider must remain in the Phoenix catalog');
  assert.match(kiloBlock, /^auth\s*=\s*"none"\s*$/m);
  for (const modelName of [
    'minimax/minimax-m3.1-flash:free',
    'poolside/laguna-s-2.1:free',
    'dots-studio/dots-3-note-preview:free',
  ]) assert.ok(kiloBlock.includes(`name = "${modelName}"`), `missing curated Kilo route ${modelName}`);

  const ordered = catalog.modelIds.slice(1);
  const scores = ordered.map(phoenixModelQualityScore);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.ok(ordered.indexOf('kilo/minimax/minimax-m3.1-flash:free') < ordered.indexOf('ovh/Qwen3.5-397B-A17B'));
  assert.ok(ordered.indexOf('ovh/Qwen3.5-397B-A17B') < ordered.indexOf('kilo/poolside/laguna-s-2.1:free'));
  assert.ok(ordered.indexOf('kilo/poolside/laguna-s-2.1:free') < ordered.indexOf('ovh/Qwen3.6-27B'));
  assert.ok(ordered.indexOf('kilo/poolside/laguna-s-2.1:free') < ordered.indexOf('kilo/dots-studio/dots-3-note-preview:free'));
});

test('checked-in Phoenix catalog exactly matches the pinned source slice', () => {
  assert.equal(verifyPhoenixCatalog(root), true);
});

test('checked-in model IDs contain Auto and only enabled canonical routes', () => {
  const ids = JSON.parse(readFileSync(join(root, 'apps', 'shell', 'resources', 'phoenix', 'phoenix-model-ids.json'), 'utf8'));
  assert.equal(ids[0], 'auto');
  assert.ok(ids.every((id) => id === 'auto' || /^(pollinations|llm7|ovh|kilo)\/.+/.test(id)));
  assert.doesNotMatch(JSON.stringify(ids), /nemotron|kilo\/kilo-auto\/free|kilo\/openrouter\/free/i);
  assert.equal(new Set(ids).size, ids.length);
});
