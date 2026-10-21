import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhoenixArgs, createPhoenixEnvironment, validatePhoenixModels } from './phoenix-runtime-gate.mjs';

test('runtime smoke binds only loopback and uses the isolated profile argument', () => {
  assert.deepEqual(createPhoenixArgs(43127, 'C:/Temp/profile with spaces'), [
    '--host', '127.0.0.1', '--port', '43127', '--state-dir', 'C:/Temp/profile with spaces',
  ]);
  assert.throws(() => createPhoenixArgs(0, 'C:/Temp/phoenix'), /port/i);
});

test('runtime smoke forwards only OS bootstrap variables and its random local key', () => {
  const env = createPhoenixEnvironment({
    PATH: 'C:/Windows/System32',
    SYSTEMROOT: 'C:/Windows',
    OPENAI_API_KEY: 'must-not-leak',
    FREELLMPOOL_CONFIG_FILE: 'must-not-leak-either',
  }, 'a'.repeat(64));

  assert.equal(env.PATH, 'C:/Windows/System32');
  assert.equal(env.FREECODE_PHOENIX_PROXY_KEY, 'a'.repeat(64));
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.FREELLMPOOL_CONFIG_FILE, undefined);
  assert.throws(() => createPhoenixEnvironment({}, 'short'), /random per-instance/i);
});

test('runtime smoke hides routing aliases and accepts only allowlisted provider model IDs', () => {
  const models = validatePhoenixModels({ data: [
    { id: 'auto' }, { id: 'agent' }, { id: 'spread' }, { id: 'fast' },
    { id: 'pollinations/openai-fast' },
    { id: 'ovh/Mistral-Nemo-Instruct-2407' },
  ] }, ['auto', 'pollinations/openai-fast', 'ovh/Mistral-Nemo-Instruct-2407']);
  assert.deepEqual(models, [
    'auto',
    'pollinations/openai-fast',
    'ovh/Mistral-Nemo-Instruct-2407',
  ]);
  assert.throws(() => validatePhoenixModels({ data: [{ id: 'auto' }, { id: 'openai/gpt-4.1' }] }, ['auto']), /unexpected provider/i);
  assert.throws(() => validatePhoenixModels({ data: [{ id: 'auto' }] }, ['auto']), /at least one concrete/i);
  assert.throws(() => validatePhoenixModels({ data: [{ id: 'auto' }, { id: 'pollinations/foo' }] }, ['auto']), /missing from.*allowlist/i);
  for (const forbidden of [
    'kilo/nvidia/nemotron-3-super-120b-a12b:free',
    'kilo/openrouter/free',
    'kilo/kilo-auto/free',
  ]) {
    assert.throws(() => validatePhoenixModels({ data: [{ id: 'auto' }, { id: forbidden }] }, ['auto', forbidden]), /Nemotron|dynamic|forbidden/i);
  }
});
