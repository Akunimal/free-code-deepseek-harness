#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshRuntimeDependencyPins } from './runtime-dependency-pins.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'apps/shell/resources/runtime-deps.json');
const payloadRoot = resolve(process.argv[2] ?? join(root, 'apps/shell/resources/freecode'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const refreshed = refreshRuntimeDependencyPins(manifest, payloadRoot);
writeFileSync(manifestPath, `${JSON.stringify(refreshed, null, 2)}\n`, 'utf8');
for (const id of ['dsh-cli']) {
  const dependency = refreshed.dependencies.find((item) => item.id === id);
  console.log(`refresh-runtime-dependency-pins: ${id} ${dependency.version} sha256=${dependency.sha256}`);
}
