'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROTATION_DEFAULTS = Object.freeze({
  sota: Object.freeze({ alias: 'sota', order: Object.freeze([
    'deepseek-v4.1-flash', 'glm-5.3', 'grok-4.6', 'kimi-k3', 'qwen3.8-max'
  ]) }),
  sweet: Object.freeze({ alias: 'sweet', order: Object.freeze([]) }),
  first_output_seconds: 30
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function keyFingerprint(config) {
  if (!Array.isArray(config?.server_keys)) return null;
  if (config.server_keys.some(value => typeof value !== 'string')) return null;
  const keys = config.server_keys.map(value => value.trim());
  if (!keys.length || keys.some(value => !value)) return null;
  const credentials = { server_keys: keys, server_key_metadata: config.server_key_metadata || {} };
  for (const name of ['zen_keys', 'go_keys']) {
    if (config[name] !== undefined && (!Array.isArray(config[name]) || config[name].some(value => typeof value !== 'string'))) return null;
    credentials[name] = (config[name] || []).map(value => value.trim()).filter(Boolean);
  }
  return crypto.createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
}

function firstEnabledServerKey(config) {
  if (!Array.isArray(config?.server_keys)) return '';
  return config.server_keys.find(key => {
    if (typeof key !== 'string' || !key.trim()) return false;
    const id = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    const metadata = config.server_key_metadata?.[id] || config.server_key_metadata?.[id.slice(0, 10)];
    return metadata?.disabled !== true;
  }) || '';
}

function atomicWriteJson(filePath, value) {
  const serialized = JSON.stringify(value, null, 2) + '\n';
  try {
    if (fs.readFileSync(filePath, 'utf8') === serialized) return false;
  } catch {}
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tempPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
  return true;
}

function normalizePoolConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('gateway config must be a JSON object');
  }
  if (!keyFingerprint(input)) throw new Error('gateway config must contain at least one non-empty server key');
  validatePoolConfig(input);

  const config = clone(input);
  config.listen = '127.0.0.1:8082';
  config.warp = { enabled: true, pool_size: Math.max(1, input.warp?.pool_size || 1) };
  config.rotation = {
    sota: { alias: ROTATION_DEFAULTS.sota.alias, order: [...ROTATION_DEFAULTS.sota.order] },
    sweet: { alias: ROTATION_DEFAULTS.sweet.alias, order: [] },
    first_output_seconds: ROTATION_DEFAULTS.first_output_seconds
  };
  config.retry = { ...(config.retry || {}), max_attempts: 1, timeout_seconds: Math.max(645, config.retry?.timeout_seconds || 645) };
  config.performance = { ...(config.performance || {}), first_event_timeout_seconds: 40, attempt_timeout_seconds: 45 };
  // v1.4.3 fixes the official 2.x request shape on /inference. Keep its
  // same-model /zen compatibility fallback; the outer deadline bounds both.
  config.upstream = { ...(config.upstream || {}), anonymous: 'https://opencode.ai/inference' };
  // The Cloudflare transport is selected per inference request. Startup and
  // catalog traffic need no SOCKS front or harvested proxy file.
  config.proxies = ['direct'];
  config.proxyfile = '';
  config.webui = {
    ...(config.webui || {}),
    enabled: false,
    listen: '127.0.0.1:0'
  };
  return config;
}

function validatePoolConfig(config) {
  if (!keyFingerprint(config)) throw new Error('gateway config must contain at least one non-empty server key');
  if (config.prefer !== undefined && !['zen', 'go'].includes(config.prefer)) {
    throw new Error('gateway config prefer must be "zen" or "go"');
  }
  if (config.anonymous === false && !(config.zen_keys?.length || config.go_keys?.length)) {
    throw new Error('gateway config needs anonymous access or an upstream key');
  }
  if (config.retry?.timeout_seconds !== undefined && (!Number.isInteger(config.retry.timeout_seconds) || config.retry.timeout_seconds < 1)) {
    throw new Error('gateway config retry.timeout_seconds must be a positive integer');
  }
  if (config.performance !== undefined && (!config.performance || typeof config.performance !== 'object' || Array.isArray(config.performance))) {
    throw new Error('gateway config performance must be an object');
  }
  for (const [name, value] of Object.entries(config.upstream || {})) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`gateway config upstream.${name} must be a non-empty URL`);
    let parsed;
    try { parsed = new URL(value); } catch {}
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || !parsed.host) {
      throw new Error(`gateway config upstream.${name} must be an HTTP or HTTPS URL`);
    }
  }
}

function normalizeDirectConfig(poolConfig) {
  const config = clone(poolConfig);
  config.listen = '127.0.0.1:8084';
  config.warp = { enabled: false, pool_size: 1 };
  config.proxies = ['direct'];
  config.performance = { ...config.performance, first_event_timeout_seconds: 30, attempt_timeout_seconds: 35 };
  config.proxyfile = '';
  config.webui = { ...(config.webui || {}), enabled: false, listen: '127.0.0.1:0' };
  return config;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function prepareGatewayConfigs(home, { poolPort = 8082, directPort = 8084, poolFrontPort = 40100, validateCandidate } = {}) {
  for (const port of [poolPort, directPort, poolFrontPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('gateway runtime ports must be valid TCP ports');
  }
  const configDir = path.join(home, 'config');
  const dataDir = path.join(home, 'data');
  const sourcePath = path.join(configDir, 'config.json');
  const poolPath = path.join(dataDir, 'pool-config.json');
  const directPath = path.join(dataDir, 'direct-config.json');
  const lastGoodPath = path.join(dataDir, 'pool-config.last-good.json');

  // Keep the last usable model catalog on the sidecar path used by the new
  // canonical pool config. This avoids a cold remote catalog refresh at boot.
  const catalogCache = `${sourcePath}.models.catalog.json`;
  const migratedCatalogCache = `${poolPath}.models.catalog.json`;
  if (!fs.existsSync(migratedCatalogCache) && fs.existsSync(catalogCache)) {
    try { atomicWriteJson(migratedCatalogCache, readJson(catalogCache)); } catch {}
  }

  let sourcePathUsed = sourcePath;
  let source;
  let sourceBytes;
  try {
    sourceBytes = fs.readFileSync(sourcePathUsed, 'utf8');
    source = JSON.parse(sourceBytes);
  } catch (error) {
    throw new Error(`cannot parse ${path.basename(sourcePathUsed)}; refusing an unverifiable credential rollback (${error.message})`);
  }

  let poolConfig;
  try {
    poolConfig = normalizePoolConfig(source);
    validatePoolConfig(poolConfig);
  } catch (error) {
    let lastGood;
    try { lastGood = readJson(lastGoodPath); } catch {}
    const currentFingerprint = keyFingerprint(source);
    if (!lastGood || !currentFingerprint || currentFingerprint !== keyFingerprint(lastGood)) {
      throw new Error(`${error.message}; no last-known-good config with matching credentials`);
    }
    poolConfig = normalizePoolConfig(lastGood);
    validatePoolConfig(poolConfig);
    sourcePathUsed = lastGoodPath;
  }

  const activate = () => {
    if (fs.readFileSync(sourcePath, 'utf8') !== sourceBytes) throw new Error('declared config changed during validation; retrying the new version');
    poolConfig.listen = `127.0.0.1:${poolPort}`;
    poolConfig.proxies = ['direct'];
    atomicWriteJson(poolPath, poolConfig);
    atomicWriteJson(lastGoodPath, poolConfig);
    const directConfig = normalizeDirectConfig(poolConfig);
    directConfig.listen = `127.0.0.1:${directPort}`;
    atomicWriteJson(directPath, directConfig);
    return { poolPath, directPath, sourcePath: sourcePathUsed, recovered: sourcePathUsed === lastGoodPath };
  };
  if (!validateCandidate) return activate();
  return (async () => {
    try {
      await validateCandidate(poolConfig);
    } catch (error) {
      let lastGood;
      try { lastGood = readJson(lastGoodPath); } catch {}
      if (sourcePathUsed === lastGoodPath || !lastGood || !keyFingerprint(source) || keyFingerprint(source) !== keyFingerprint(lastGood)) {
        throw error;
      }
      poolConfig = normalizePoolConfig(lastGood);
      await validateCandidate(poolConfig);
      sourcePathUsed = lastGoodPath;
    }
    return activate();
  })();
}

module.exports = {
  ROTATION_DEFAULTS,
  atomicWriteJson,
  keyFingerprint,
  firstEnabledServerKey,
  normalizePoolConfig,
  validatePoolConfig,
  normalizeDirectConfig,
  prepareGatewayConfigs
};
