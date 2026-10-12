#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, open, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function sha512File(path) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('base64');
}

export async function verifyNsisPackageOutput(setupPath, version) {
  const absoluteSetup = resolve(setupPath);
  const expectedName = `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`;
  if (basename(absoluteSetup) !== expectedName) {
    throw new Error(`verify-nsis-package-output: expected ${expectedName}, got ${basename(absoluteSetup)}`);
  }
  const outputDir = dirname(absoluteSetup);
  const setupStat = await stat(absoluteSetup);
  if (setupStat.size < 2) throw new Error('verify-nsis-package-output: setup executable is empty');
  const handle = await open(absoluteSetup, 'r');
  const header = Buffer.alloc(2);
  try { await handle.read(header, 0, 2, 0); } finally { await handle.close(); }
  if (header.length !== 2 || header[0] !== 0x4d || header[1] !== 0x5a) {
    throw new Error('verify-nsis-package-output: setup does not have a Windows PE signature');
  }

  const blockmapPath = `${absoluteSetup}.blockmap`;
  const latestPath = join(outputDir, 'latest.yml');
  const unpackedExe = join(outputDir, 'win-unpacked', 'FreeCode DeepSeek Harness.exe');
  const runtimeManifest = join(outputDir, 'win-unpacked', 'resources', 'freecode', 'runtime-manifest.json');
  const forbiddenDsh = join(outputDir, 'win-unpacked', 'resources', 'freecode', 'dsh');
  for (const required of [blockmapPath, latestPath, unpackedExe, runtimeManifest]) {
    await access(required).catch(() => { throw new Error(`verify-nsis-package-output: missing ${required}`); });
  }
  await access(forbiddenDsh).then(
    () => { throw new Error('verify-nsis-package-output: DSH runtime payload must remain a separate release asset'); },
    () => undefined,
  );

  const latest = await readFile(latestPath, 'utf8');
  const readScalar = (key) => latest.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  const latestVersion = readScalar('version');
  const latestPathName = readScalar('path');
  const latestSha512 = readScalar('sha512');
  const latestSize = Number(readScalar('size'));
  if (latestVersion !== version || latestPathName !== expectedName || latestSize !== setupStat.size) {
    throw new Error('verify-nsis-package-output: latest.yml version/path/size do not match setup artifact');
  }
  const actualSha512 = await sha512File(absoluteSetup);
  if (latestSha512 !== actualSha512) throw new Error('verify-nsis-package-output: latest.yml SHA-512 does not match setup artifact');

  return { setupPath: absoluteSetup, size: setupStat.size, sha512: actualSha512 };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const setupPath = process.argv[2];
  if (!setupPath) throw new Error('usage: node scripts/verify-nsis-package-output.mjs <exact-setup-path>');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const result = await verifyNsisPackageOutput(setupPath, version);
  console.log(`verify-nsis-package-output: v${version} setup, blockmap, update metadata, runtime manifest, and separate-DSH policy verified (${result.size} bytes).`);
}
