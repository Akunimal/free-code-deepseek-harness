import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePhoenixBinary, resolvePhoenixDirectory } from './resource-paths.js';

export const PHOENIX_UPSTREAM = Object.freeze({
  repository: 'https://github.com/0xzr/freellmpool',
  commit: 'e4411650da95edf3002c6789ccd1c816aedae1d4',
  version: '0.13.0',
  tarballSha256: '31175b80b613386550d247e89546ab312f66bf49950ebdddf3d4ee9e937e6aa6',
});

const BINARY_NAME = 'freellmpool-win-x64.exe';
const MODEL_FILE = 'phoenix-model-ids.json';
const RECEIPT_FILE = 'freecode-build-receipt.json';
const ALLOWED_PROVIDERS = new Set(['pollinations', 'llm7', 'ovh', 'kilo']);
const FORBIDDEN_DYNAMIC_KILO_IDS = new Set(['kilo/openrouter/free', 'kilo/kilo-auto/free']);

export interface VerifiedPhoenixPayload {
  binaryPath: string;
  modelsPath: string;
  licensePath: string;
  modelIds: string[];
  binarySha256: string;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(path: string, label: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not a JSON object');
    return value as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${label} is missing or invalid: ${path}`, { cause: error });
  }
}

function assertWindowsX64ConsoleExecutable(bytes: Buffer): void {
  if (bytes.length < 256 || bytes.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('Phoenix FreeLLMpool sidecar is not a valid Windows PE executable');
  }
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 64 || pe + 94 > bytes.length || bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0'
    || bytes.readUInt16LE(pe + 4) !== 0x8664 || bytes.readUInt16LE(pe + 24) !== 0x20b
    || bytes.readUInt16LE(pe + 92) !== 3) {
    throw new Error('Phoenix FreeLLMpool sidecar must be a Windows x64 console executable');
  }
}

function readModelIds(path: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Phoenix packaged model allowlist is missing or invalid: ${path}`, { cause: error });
  }
  if (!Array.isArray(value) || value[0] !== 'auto' || new Set(value).size !== value.length
    || value.length < 2 || !value.every((id): id is string => typeof id === 'string')) {
    throw new Error('Phoenix model allowlist must start with Auto Phoenix and contain unique model IDs');
  }
  for (const id of value.slice(1)) {
    if (/nemotron/i.test(id)) throw new Error(`Phoenix model allowlist may not include Nemotron: ${id}`);
    if (FORBIDDEN_DYNAMIC_KILO_IDS.has(id)) {
      throw new Error(`Phoenix model allowlist may not include a dynamic Kilo route: ${id}`);
    }
    const [provider, ...model] = id.split('/');
    if (!provider || model.length === 0 || !ALLOWED_PROVIDERS.has(provider)) {
      throw new Error(`Phoenix model allowlist contains an unapproved provider route: ${id}`);
    }
  }
  return value;
}

/** Fail closed unless the packaged gateway, pinned provenance, allowlist and license agree. */
export function verifyPhoenixPayload(
  resourcesDir: string,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): VerifiedPhoenixPayload {
  if (platform !== 'win32' || arch !== 'x64') {
    throw new Error('The Phoenix FreeLLMpool sidecar is currently packaged for Windows x64 only');
  }
  const phoenixDir = resolvePhoenixDirectory(resourcesDir);
  const binaryPath = resolvePhoenixBinary(resourcesDir);
  const modelsPath = join(phoenixDir, MODEL_FILE);
  const licensePath = join(phoenixDir, 'LICENSE');
  const receipt = readJson(join(phoenixDir, RECEIPT_FILE), 'Packaged Phoenix build receipt');
  const upstream = receipt.upstream as Record<string, unknown> | undefined;
  const toolchain = receipt.toolchain as Record<string, unknown> | undefined;
  if (receipt.schemaVersion !== 1 || upstream?.repository !== PHOENIX_UPSTREAM.repository
    || upstream?.commit !== PHOENIX_UPSTREAM.commit || upstream?.version !== PHOENIX_UPSTREAM.version
    || upstream?.tarballSha256 !== PHOENIX_UPSTREAM.tarballSha256) {
    throw new Error('Packaged Phoenix receipt does not match the pinned FreeLLMpool source');
  }
  if (typeof receipt.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.sourceSha256)
    || toolchain?.architecture !== 'AMD64' || typeof toolchain.pythonVersion !== 'string'
    || typeof toolchain.pyinstallerVersion !== 'string' || !toolchain.runtime || typeof toolchain.runtime !== 'object') {
    throw new Error('Packaged Phoenix receipt has no valid source fingerprint or Windows x64 build provenance');
  }

  const binary = readFileSync(binaryPath);
  const models = readFileSync(modelsPath);
  const license = readFileSync(licensePath);
  assertWindowsX64ConsoleExecutable(binary);
  if (receipt.binarySha256 !== sha256(binary)) throw new Error('Packaged Phoenix sidecar hash does not match its build receipt');
  if (receipt.modelsCatalogSha256 !== sha256(models)) throw new Error('Packaged Phoenix model allowlist hash does not match its build receipt');
  if (receipt.licenseSha256 !== sha256(license)) throw new Error('Packaged Phoenix FreeLLMpool license hash does not match its build receipt');
  return { binaryPath, modelsPath, licensePath, modelIds: readModelIds(modelsPath), binarySha256: receipt.binarySha256 as string };
}
