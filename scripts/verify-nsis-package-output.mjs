#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyWindowsPeFile } from './windows-pe.mjs';

async function sha512File(path) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('base64');
}

function yamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed[0] === "'" && trimmed.at(-1) === "'") {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed.at(-1) === '"') {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  return trimmed;
}

function parseElectronBuilderLatest(text) {
  const topLevel = {};
  const files = [];
  let readingFiles = false;
  let currentFile;

  for (const line of text.split(/\r?\n/)) {
    const top = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (top) {
      readingFiles = top[1] === 'files';
      currentFile = undefined;
      topLevel[top[1]] = yamlScalar(top[2]);
      continue;
    }
    if (!readingFiles) continue;
    const entry = /^\s*-\s+url:\s*(.*?)\s*$/.exec(line);
    if (entry) {
      currentFile = { url: yamlScalar(entry[1]) };
      files.push(currentFile);
      continue;
    }
    const field = /^\s+([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (currentFile && field) currentFile[field[1]] = yamlScalar(field[2]);
  }
  return { topLevel, files };
}

export async function verifyNsisPackageOutput(setupPath, version) {
  const absoluteSetup = resolve(setupPath);
  const expectedName = `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`;
  if (basename(absoluteSetup) !== expectedName) {
    throw new Error(`verify-nsis-package-output: expected ${expectedName}, got ${basename(absoluteSetup)}`);
  }
  const outputDir = dirname(absoluteSetup);
  const setupStat = await stat(absoluteSetup);
  await verifyWindowsPeFile(absoluteSetup, 'verify-nsis-package-output: setup');

  const blockmapPath = `${absoluteSetup}.blockmap`;
  const latestPath = join(outputDir, 'latest.yml');
  const unpackedExe = join(outputDir, 'win-unpacked', 'FreeCode DeepSeek Harness.exe');
  const runtimeManifest = join(outputDir, 'win-unpacked', 'resources', 'freecode', 'runtime-manifest.json');
  const forbiddenDsh = join(outputDir, 'win-unpacked', 'resources', 'freecode', 'dsh');
  for (const required of [blockmapPath, latestPath, unpackedExe, runtimeManifest]) {
    await access(required).catch(() => { throw new Error(`verify-nsis-package-output: missing ${required}`); });
  }
  const blockmapStat = await stat(blockmapPath);
  if (blockmapStat.size === 0) throw new Error('verify-nsis-package-output: setup blockmap is empty');
  await access(forbiddenDsh).then(
    () => { throw new Error('verify-nsis-package-output: DSH runtime payload must remain a separate release asset'); },
    () => undefined,
  );

  const latest = parseElectronBuilderLatest(await readFile(latestPath, 'utf8'));
  const entry = latest.files.find((file) => file.url === expectedName);
  const actualSha512 = await sha512File(absoluteSetup);
  const latestSize = Number(entry?.size ?? latest.topLevel.size);
  const sha512Values = [entry?.sha512, latest.topLevel.sha512].filter((value) => value !== undefined);
  if (latest.topLevel.version !== version || latest.topLevel.path !== expectedName || !entry || latestSize !== setupStat.size) {
    throw new Error('verify-nsis-package-output: latest.yml version/path/files size do not match setup artifact');
  }
  if (sha512Values.length === 0 || sha512Values.some((value) => value !== actualSha512)) {
    throw new Error('verify-nsis-package-output: latest.yml SHA-512 does not match setup artifact');
  }

  return { setupPath: absoluteSetup, size: setupStat.size, sha512: actualSha512, blockmapSize: blockmapStat.size };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const setupPath = process.argv[2];
  if (!setupPath) throw new Error('usage: node scripts/verify-nsis-package-output.mjs <exact-setup-path>');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const result = await verifyNsisPackageOutput(setupPath, version);
  console.log(`verify-nsis-package-output: v${version} setup, blockmap, update metadata, runtime manifest, and separate-DSH policy verified (${result.size} bytes).`);
}
