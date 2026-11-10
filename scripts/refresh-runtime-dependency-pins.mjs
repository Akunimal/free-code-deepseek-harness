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
const dshCli = refreshed.dependencies.find((item) => item.id === 'dsh-cli');
console.log(`refresh-runtime-dependency-pins: dsh-cli ${dshCli.version} sha256=${dshCli.sha256}`);
