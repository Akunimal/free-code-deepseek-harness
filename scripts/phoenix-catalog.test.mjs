import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  extractPhoenixCatalog,
  PHOENIX_TOOL_VERIFIED_IDS,
  phoenixModelQualityScore,
  readFreeCodeSlice,
  verifyPhoenixCatalog,
} from './phoenix-catalog.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\//, '').replaceAll('%20', ' ');

test('Phoenix ships only the pinned keyless/free provider slices in deterministic order', () => {
  const upstream = readFileSync(join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml'), 'utf8');
  const catalog = extractPhoenixCatalog(upstream, readFreeCodeSlice(root));
  assert.deepEqual(catalog.providerIds, ['pollinations', 'llm7', 'ovh', 'kilo', 'freeai']);
  assert.equal(catalog.modelIds[0], 'auto');
  assert.ok(catalog.modelIds.includes('pollinations/openai-fast'));
  assert.ok(!catalog.modelIds.includes('pollinations/gpt-oss-20b'));
  assert.ok(!catalog.modelIds.includes('llm7/qwen3-235b'));
  assert.ok(!catalog.modelIds.includes('kilo/minimax/minimax-m3:free'));
  assert.doesNotMatch(catalog.text, /\[\[embedder\]\]|\[\[transcriber\]\]/);
  assert.match(catalog.text, /auth\s*=\s*"none"/);
  assert.doesNotMatch(catalog.text, /api[_-]?key\s*=\s*["'][^"']{20,}["']/i);
});

test('Kilo exposes only its tool-verified direct free routes, ranked by quality before speed', () => {
  const upstream = readFileSync(join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml'), 'utf8');
  const catalog = extractPhoenixCatalog(upstream, readFreeCodeSlice(root));
  const kiloIds = catalog.modelIds.filter((id) => id.startsWith('kilo/'));
  assert.deepEqual(kiloIds, [
    'kilo/poolside/laguna-s-2.1:free',
    'kilo/dots-studio/dots-3-note-preview:free',
    'kilo/reflection/beam-free',
    'kilo/recursive/flint-v1.0:free',
    'kilo/liquid/lfm-2.5-2.6b:free',
  ]);
  assert.doesNotMatch(catalog.text, /nemotron|kilo-auto\/free|openrouter\/free/i);
  assert.doesNotMatch(JSON.stringify(catalog.modelIds), /nemotron|kilo\/kilo-auto\/free|kilo\/openrouter\/free/i);
  const kiloBlock = catalog.text.split('[[provider]]').find((block) => /^\s*id\s*=\s*"kilo"\s*$/m.test(block));
  assert.ok(kiloBlock, 'curated no-auth Kilo provider must remain in the Phoenix catalog');
  assert.match(kiloBlock, /^auth\s*=\s*"none"\s*$/m);
  assert.doesNotMatch(kiloBlock, /minimax|kilo-auto|openrouter\/free/);

  const ordered = catalog.modelIds.slice(1);
  const scores = ordered.map(phoenixModelQualityScore);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.ok(ordered.indexOf('ovh/Qwen3.5-397B-A17B') < ordered.indexOf('kilo/poolside/laguna-s-2.1:free'));
  assert.ok(ordered.indexOf('kilo/poolside/laguna-s-2.1:free') < ordered.indexOf('ovh/Qwen3.6-27B'));
  assert.ok(ordered.indexOf('kilo/poolside/laguna-s-2.1:free') < ordered.indexOf('kilo/dots-studio/dots-3-note-preview:free'));
});

test('only tool-verified routes enter the Phoenix selector allowlist', () => {
  const upstream = readFileSync(join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml'), 'utf8');
  const catalog = extractPhoenixCatalog(upstream, readFreeCodeSlice(root));
  for (const id of catalog.modelIds.slice(1)) assert.ok(PHOENIX_TOOL_VERIFIED_IDS.has(id), `unverified route ${id}`);
  for (const id of ['ovh/Qwen3-Coder-30B-A3B-Instruct', 'ovh/Qwen2.5-VL-72B-Instruct', 'llm7/codestral-latest', 'kilo/minimax/minimax-m3.1-flash:free']) {
    assert.ok(!catalog.modelIds.includes(id), `${id} failed tool calling and must stay out`);
  }
});

test('Free.ai is a keyless FreeCode slice with its tool-verified routes', () => {
  const upstream = readFileSync(join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml'), 'utf8');
  const catalog = extractPhoenixCatalog(upstream, readFreeCodeSlice(root));
  assert.deepEqual(catalog.modelIds.filter((id) => id.startsWith('freeai/')), [
    'freeai/qwen3-coder',
    'freeai/qwen-coder',
    'freeai/qwen-vl',
    'freeai/qwen7b',
    'freeai/qwen25-vl',
    'freeai/deepseek-r1',
    'freeai/mistral',
    'freeai/qwen3-8b',
  ]);
  const block = catalog.text.split('[[provider]]').find((part) => /^\s*id\s*=\s*"freeai"\s*$/m.test(part));
  assert.ok(block, 'Free.ai provider must be in the Phoenix catalog');
  assert.match(block, /^base_url\s*=\s*"https:\/\/api\.free\.ai\/v1"\s*$/m);
  assert.match(block, /^auth\s*=\s*"none"\s*$/m);
  assert.doesNotMatch(block, /key_env|key_optional/);
});

test('checked-in Phoenix catalog exactly matches the pinned source slice', () => {
  assert.equal(verifyPhoenixCatalog(root), true);
});

test('checked-in model IDs contain Auto and only enabled canonical routes', () => {
  const ids = JSON.parse(readFileSync(join(root, 'apps', 'shell', 'resources', 'phoenix', 'phoenix-model-ids.json'), 'utf8'));
  assert.equal(ids[0], 'auto');
  assert.ok(ids.every((id) => id === 'auto' || /^(pollinations|llm7|ovh|kilo|freeai)\/.+/.test(id)));
  assert.doesNotMatch(JSON.stringify(ids), /nemotron|kilo\/kilo-auto\/free|kilo\/openrouter\/free/i);
  assert.equal(new Set(ids).size, ids.length);
});
