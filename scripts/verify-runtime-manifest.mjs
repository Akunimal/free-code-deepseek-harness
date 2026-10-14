#!/usr/bin/env node
/**
 * Fail-closed validation for the runtime manifest shipped beside the bundled
 * Harness. Keep this gate before the expensive electron-builder step so a
 * malformed ignored/generated file cannot produce a half-valid release.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve(process.argv[2] ?? '');
if (!manifestPath || !existsSync(manifestPath)) {
  throw new Error(`verify-runtime-manifest: manifest not found: ${manifestPath}`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  throw new Error(`verify-runtime-manifest: invalid JSON in ${manifestPath}: ${error.message}`);
}

if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
  throw new Error(`verify-runtime-manifest: manifest must be a JSON object: ${manifestPath}`);
}

const requirements = [
  ['version', value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)],
  ['nodeModuleVersion', value => typeof value === 'string' && /^\d+$/.test(value)],
  ['cli', value => value === 'dsh/apps/cli/lib/bin.js'],
  ['install', value => value === 'core-allowlist'],
  ['optionalProviders', value => value === 'external-only'],
];

for (const [field, predicate] of requirements) {
  if (!predicate(manifest[field])) {
    throw new Error(`verify-runtime-manifest: invalid ${field}: ${JSON.stringify(manifest[field])}`);
  }
}

if (process.argv[3]) {
  const pin = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8'));
  if (manifest.version !== pin.version) throw new Error(`verify-runtime-manifest: source pin ${pin.version} disagrees with stage ${manifest.version}`);
}

console.log(`verify-runtime-manifest: valid ${manifest.version}`);
