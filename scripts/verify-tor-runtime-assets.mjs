#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyTorRuntimeAssets } from './tor-runtime-assets.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dependencyManifest = JSON.parse(readFileSync(join(root, 'apps/shell/resources/runtime-deps.json'), 'utf8'));
const tor = dependencyManifest.dependencies.find((dependency) => dependency.id === 'tor' && dependency.required === true);
if (!tor || typeof tor.sha256 !== 'string') {
  throw new Error('Tor runtime dependency is not pinned as a required asset in runtime-deps.json');
}

const resourcesRoot = resolve(process.argv[2] ?? join(root, 'apps/shell/resources/freecode'));
const result = verifyTorRuntimeAssets(resourcesRoot, tor.sha256);
console.log(`verify-tor-runtime-assets: tor.exe and both GeoIP databases verified (${result.sha256}) under ${resourcesRoot}`);
