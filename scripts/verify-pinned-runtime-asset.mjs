#!/usr/bin/env node

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { verifyRuntimeArchive } from './runtime-archive-verification.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`verify-pinned-runtime-asset: release gate requires win32-x64, got ${process.platform}-${process.arch}`);
}

const resources = join(root, 'apps/shell/resources/freecode');
const manifestPath = join(resources, 'runtime-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const assetName = `deepseek-harness-runtime-${manifest.version}-win32-x64.tar.gz`;
const assetPath = join(root, 'apps/shell/release', assetName);
const result = await verifyRuntimeArchive({
  archivePath: assetPath,
  checksumPath: `${assetPath}.sha256`,
  manifestPath,
  platform: 'win32',
  arch: 'x64',
});
console.log(`verify-pinned-runtime-asset: ${result.assetName} SHA-256 ${result.digest} verified; archive left unchanged.`);
