import { isAbsolute } from 'node:path';

const PROVIDER_IDS = new Set(['pollinations', 'llm7', 'ovh', 'kilo', 'freeai']);
const ROUTING_ALIASES = new Set(['auto', 'agent', 'spread', 'fast', 'quality', 'fair']);
const FORBIDDEN_DYNAMIC_KILO_IDS = new Set(['kilo/openrouter/free', 'kilo/kilo-auto/free']);
const OS_ENV_KEYS = ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC'];

export function createPhoenixArgs(port, stateDir) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RangeError(`Phoenix loopback smoke requires a valid TCP port, got ${String(port)}`);
  }
  if (typeof stateDir !== 'string' || !isAbsolute(stateDir)) {
    throw new TypeError('Phoenix smoke state directory must be an absolute test-owned path');
  }
  return ['--host', '127.0.0.1', '--port', String(port), '--state-dir', stateDir];
}

export function createPhoenixEnvironment(source, apiKey) {
  if (typeof apiKey !== 'string' || !/^[a-f0-9]{64}$/i.test(apiKey)) {
    throw new TypeError('Phoenix requires a 32-byte random per-instance API key');
  }
  const environment = {};
  for (const key of OS_ENV_KEYS) {
    const actual = Object.keys(source).find((candidate) => candidate.toUpperCase() === key);
    if (actual !== undefined && source[actual] !== undefined) environment[key] = source[actual];
  }
  environment.FREECODE_PHOENIX_PROXY_KEY = apiKey;
  return environment;
}

export function validatePhoenixModels(payload, allowedModelIds) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
    throw new TypeError('Phoenix /v1/models must return an OpenAI-compatible data list');
  }
  if (!Array.isArray(allowedModelIds) || allowedModelIds[0] !== 'auto'
    || new Set(allowedModelIds).size !== allowedModelIds.length) {
    throw new TypeError('Phoenix packaged model allowlist must be unique and start with Auto Phoenix');
  }
  const ids = payload.data.map((model) => model && typeof model.id === 'string' ? model.id : null);
  if (ids.some((id) => id === null)) throw new TypeError('Phoenix model inventory contains a missing ID');
  if (new Set(ids).size !== ids.length) throw new TypeError('Phoenix model inventory contains duplicate IDs');
  const allowed = new Set(allowedModelIds);
  for (const id of ids) {
    if (/nemotron/i.test(id)) throw new TypeError(`Phoenix smoke model inventory must exclude Nemotron: ${id}`);
    if (FORBIDDEN_DYNAMIC_KILO_IDS.has(id)) {
      throw new TypeError(`Phoenix smoke model inventory contains a dynamic Kilo route: ${id}`);
    }
    if (ROUTING_ALIASES.has(id)) continue;
    const provider = id.split('/', 1)[0];
    if (!id.includes('/') || !PROVIDER_IDS.has(provider)) {
      throw new TypeError(`Phoenix inventory includes an unexpected provider/model ID: ${id}`);
    }
    if (!allowed.has(id)) throw new TypeError(`Phoenix inventory model is missing from the packaged allowlist: ${id}`);
  }
  const visibleIds = ids.filter((id) => allowed.has(id));
  if (visibleIds[0] !== 'auto') throw new TypeError('Auto Phoenix must be the first model in the selector');
  if (visibleIds.length !== allowedModelIds.length
    || allowedModelIds.some((id) => !visibleIds.includes(id))) {
    throw new TypeError('Phoenix runtime inventory differs from the packaged model allowlist');
  }
  if (visibleIds.length < 2) throw new TypeError('Phoenix must expose Auto Phoenix and at least one concrete model');
  return visibleIds;
}
