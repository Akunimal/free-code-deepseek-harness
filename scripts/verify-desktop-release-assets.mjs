#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNsisPackageOutput } from './verify-nsis-package-output.mjs';
import { verifyWindowsPeFile } from './windows-pe.mjs';

const setupName = (version) => `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`;
const portableName = (version) => `FreeCode-DeepSeek-Harness-${version}-win-x64-portable.exe`;

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyDesktopReleaseAssets(outputDir, version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`verify-desktop-release-assets: invalid version ${String(version)}`);
  }
  const absoluteOutput = resolve(outputDir);
  const setupPath = join(absoluteOutput, setupName(version));
  const portablePath = join(absoluteOutput, portableName(version));
  await access(portablePath).catch(() => {
    throw new Error(`verify-desktop-release-assets: missing portable artifact ${portablePath}`);
  });

  const setupVerification = await verifyNsisPackageOutput(setupPath, version);
  const portableVerification = await verifyWindowsPeFile(portablePath, 'verify-desktop-release-assets: portable');
  const blockmapPath = `${setupPath}.blockmap`;
  const blockmapStat = await stat(blockmapPath);
  if (blockmapStat.size === 0) {
    throw new Error('verify-desktop-release-assets: setup blockmap is empty');
  }

  return {
    setup: {
      name: basename(setupPath),
      size: setupVerification.size,
      sha256: await sha256File(setupPath),
      sha512: setupVerification.sha512,
      blockmap: basename(blockmapPath),
      blockmapSize: blockmapStat.size,
    },
    portable: {
      name: basename(portablePath),
      size: portableVerification.size,
      sha256: await sha256File(portablePath),
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outputDir = process.argv[2];
  if (!outputDir) throw new Error('usage: node scripts/verify-desktop-release-assets.mjs <exact-release-directory>');
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const result = await verifyDesktopReleaseAssets(outputDir, version);
  console.log(`verify-desktop-release-assets: v${version} setup + portable + blockmap + latest.yml verified without execution.`);
  console.log(JSON.stringify(result, null, 2));
}
