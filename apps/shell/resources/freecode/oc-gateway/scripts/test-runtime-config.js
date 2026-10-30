'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareGatewayConfigs, normalizePoolConfig, atomicWriteJson, firstEnabledServerKey } = require('./runtime-config');
const crypto = require('node:crypto');

function fixtureHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-runtime-config-'));
  fs.mkdirSync(path.join(home, 'config'));
  fs.writeFileSync(path.join(home, 'config', 'config.json'), JSON.stringify({
    server_keys: ['fixture-internal-key'], anonymous: true,
    rotation: { sota: { alias: 'sota', order: ['mimo-v2.6-flash-free'] }, sweet: { alias: 'sweet', order: [] } },
    retry: { max_attempts: 3, timeout_seconds: 600 },
    proxies: ['socks5h://old:1080'], proxyfile: 'old.txt', webui: { enabled: true }
  }));
  return home;
}

const home = fixtureHome();
try {
  const prepared = prepareGatewayConfigs(home);
  const pool = JSON.parse(fs.readFileSync(prepared.poolPath, 'utf8'));
  const direct = JSON.parse(fs.readFileSync(prepared.directPath, 'utf8'));
  assert.deepEqual(pool.rotation.sota.order, ['deepseek-v4.1-flash', 'glm-5.3', 'grok-4.6', 'kimi-k3', 'qwen3.8-max']);
  assert.deepEqual(pool.rotation.sweet.order, []);
  assert.deepEqual(pool.proxies, ['direct'], 'Cloudflare backend has no SOCKS dependency');
  assert.equal(pool.retry.max_attempts, 1);
  assert.equal(pool.upstream.anonymous, 'https://opencode.ai/inference', 'v1.4.3 uses its corrected official 2.x lane first');
  assert.equal(pool.performance.first_event_timeout_seconds, 40);
  assert.equal(direct.performance.first_event_timeout_seconds, 30);
  assert.ok(pool.retry.timeout_seconds >= 640, 'backend deadline leaves room for initial wait and a 600s stream');
  assert.equal(pool.webui.enabled, false, 'backend UI cannot bypass declared-config validation');
  assert.deepEqual(direct.proxies, ['direct']);
  assert.equal(direct.listen, '127.0.0.1:8084');
  assert.equal(direct.webui.enabled, false);
  assert.deepEqual(direct.server_keys, pool.server_keys);
  console.log('PASS invalid pool rotation normalizes without losing secrets/settings');

  const activeConfigBeforeFailure = fs.readFileSync(prepared.poolPath, 'utf8');
  const renameSync = fs.renameSync;
  try {
    fs.renameSync = () => { throw new Error('simulated interrupted replace'); };
    assert.throws(() => atomicWriteJson(prepared.poolPath, { server_keys: ['partial'] }), /interrupted/);
  } finally {
    fs.renameSync = renameSync;
  }
  assert.equal(fs.readFileSync(prepared.poolPath, 'utf8'), activeConfigBeforeFailure,
    'failed atomic replacement leaves the active config intact');
  assert.deepEqual(fs.readdirSync(path.dirname(prepared.poolPath)).filter(name => name.endsWith('.tmp')), [],
    'failed temporary config is removed');
  console.log('PASS interrupted atomic replacement preserves active config and removes temp file');

  const declaredPath = path.join(home, 'config', 'config.json');
  const declared = JSON.parse(fs.readFileSync(declaredPath, 'utf8'));
  declared.prefer = 'go';
  fs.writeFileSync(declaredPath, JSON.stringify(declared));
  const changed = prepareGatewayConfigs(home);
  assert.equal(JSON.parse(fs.readFileSync(changed.poolPath, 'utf8')).prefer, 'go',
    'declared config remains the source of generated runtime config');
  console.log('PASS valid declared config edits regenerate the runtime config');

  const poolPath = prepared.poolPath;
  const lastGood = fs.readFileSync(path.join(home, 'data', 'pool-config.last-good.json'), 'utf8');
  const broken = JSON.parse(lastGood);
  broken.prefer = 'invalid';
  fs.writeFileSync(declaredPath, JSON.stringify(broken));
  const recovered = prepareGatewayConfigs(home);
  assert.equal(recovered.recovered, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(poolPath, 'utf8')).server_keys, ['fixture-internal-key']);
  console.log('PASS last-known-good recovery requires matching server-key fingerprint');

  const changedCredentials = JSON.parse(lastGood);
  changedCredentials.server_keys = ['rotated-key'];
  changedCredentials.prefer = 'invalid';
  fs.writeFileSync(declaredPath, JSON.stringify(changedCredentials));
  assert.throws(() => prepareGatewayConfigs(home), /matching credentials/);
  console.log('PASS stale credentials are never restored after key rotation');
  for (const field of ['zen_keys', 'go_keys', 'server_key_metadata']) {
    const changedProvider = JSON.parse(lastGood);
    changedProvider.prefer = 'invalid';
    changedProvider[field] = field === 'server_key_metadata' ? { fixture: { disabled: true } } : ['rotated-provider-key'];
    fs.writeFileSync(declaredPath, JSON.stringify(changedProvider));
    assert.throws(() => prepareGatewayConfigs(home), /matching credentials/);
  }
  const disabledId = crypto.createHash('sha256').update('disabled').digest('hex').slice(0, 16);
  assert.equal(firstEnabledServerKey({ server_keys: ['disabled', 'enabled'], server_key_metadata: { [disabledId]: { disabled: true } } }), 'enabled');
  assert.equal(firstEnabledServerKey({ server_keys: ['disabled'], server_key_metadata: { [disabledId]: { disabled: true } } }), '');
  console.log('PASS provider-key and authentication-state changes prevent stale rollback; disabled keys are skipped');

  assert.throws(() => normalizePoolConfig({ server_keys: [] }), /non-empty server key/);
  fs.writeFileSync(declaredPath, '{broken');
  assert.throws(() => prepareGatewayConfigs(home), /unverifiable credential rollback/);
  console.log('PASS malformed config fails closed when credential compatibility is unknowable');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
