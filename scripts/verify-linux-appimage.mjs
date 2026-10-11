#!/usr/bin/env node
/**
 * Verify the payload inside a Linux AppImage without relying on AppImage's
 * `--appimage-extract` helper. On WSL that helper can materialize selected
 * hard-linked/sparse entries as zero-byte files even when the SquashFS data is
 * intact. Reading with unsquashfs -cat validates the bytes users actually get
 * from the filesystem.
 */

import { createHash } from 'node:crypto';
import { existsSync, openSync, readFileSync, readSync, statSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const artifactPath = resolve(root, process.argv[2] ?? `apps/shell/release/FreeCode-DeepSeek-Harness-${packageVersion}-linux-x86_64.AppImage`);
const metadataPath = resolve(dirname(artifactPath), 'latest-linux.yml');

if (process.platform !== 'linux') {
  throw new Error('verify-linux-appimage: run this gate in Linux/WSL so unsquashfs validates the actual AppImage filesystem');
}
if (!existsSync(artifactPath)) throw new Error(`verify-linux-appimage: artifact not found: ${artifactPath}`);
if (!existsSync(metadataPath)) throw new Error(`verify-linux-appimage: latest-linux.yml not found: ${metadataPath}`);

function fail(message) {
  throw new Error(`verify-linux-appimage: ${message}`);
}

function findSquashfsOffset(filePath) {
  const fd = openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(Math.min(statSync(filePath).size, 4 * 1024 * 1024));
    readSync(fd, header, 0, header.length, 0);
    const magic = Buffer.from('hsqs');
    let cursor = 0;
    while (cursor < header.length) {
      const offset = header.indexOf(magic, cursor);
      if (offset < 0) break;
      const probe = spawnSync('unsquashfs', ['-s', '-offset', String(offset), filePath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      if (probe.status === 0 && probe.stdout.includes('Found a valid SQUASHFS')) return offset;
      cursor = offset + magic.length;
    }
  } finally {
    closeSync(fd);
  }
  fail('no valid SquashFS superblock found');
}

function catSquashfs(filePath, offset, entry) {
  const result = spawnSync('unsquashfs', ['-cat', '-offset', String(offset), filePath, entry], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`SquashFS entry is unreadable: ${entry}\n${String(result.stderr ?? '').trim()}`);
  }
  return result.stdout;
}

function requireContains(buffer, marker, entry) {
  if (!buffer.toString('utf8').includes(marker)) fail(`${entry} lacks ${marker}`);
}

const artifact = readFileSync(artifactPath);
if (artifact.length < 4 || artifact.subarray(0, 4).toString('hex') !== '7f454c46') {
  fail('artifact is not an ELF AppImage');
}

const offset = findSquashfsOffset(artifactPath);
const manifest = JSON.parse(catSquashfs(artifactPath, offset, 'resources/freecode/runtime-manifest.json').toString('utf8'));
if (!manifest || typeof manifest !== 'object' || typeof manifest.version !== 'string' ||
    typeof manifest.nodeModuleVersion !== 'string' || !/^\d+$/.test(manifest.nodeModuleVersion) ||
    typeof manifest.cli !== 'string') {
  fail('runtime-manifest.json does not satisfy the version/nodeModuleVersion/cli contract');
}

const linuxWorker = catSquashfs(artifactPath, offset, 'resources/freecode/opencode2api/opencode2api-linux-x64');
if (linuxWorker.subarray(0, 4).toString('hex') !== '7f454c46') fail('Linux opencode2api worker is not an ELF binary');

const tray = catSquashfs(artifactPath, offset, 'resources/freecode/tray.png');
if (tray.length === 0 || tray.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('tray.png is empty or not a PNG');

const bridge = catSquashfs(
  artifactPath,
  offset,
  'resources/freecode/dsh/node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/index.js',
).toString('utf8');
for (const marker of ['FREECODE_DIALOG_BRIDGE_ENDPOINT', 'FREECODE_DIALOG_BRIDGE_TOKEN', 'x-freecode-dialog-token', 'fetch(']) {
  requireContains(Buffer.from(bridge), marker, 'directory-picker-native bundle');
}

const appAsar = catSquashfs(artifactPath, offset, 'resources/app.asar');
const appVersion = packageVersion;
if (!appAsar.toString('utf8').includes(`"version": "${appVersion}"`)) {
  fail(`resources/app.asar does not contain application version ${appVersion}`);
}

const metadata = readFileSync(metadataPath, 'utf8');
const expectedSize = Number(metadata.match(/\n\s+size:\s+(\d+)/)?.[1] ?? NaN);
if (expectedSize !== artifact.length) fail(`latest-linux.yml size ${expectedSize} does not match artifact size ${artifact.length}`);
const expectedSha512 = metadata.match(/\nsha512:\s+([^\s]+)/)?.[1];
const actualSha512 = createHash('sha512').update(artifact).digest('base64');
if (!expectedSha512 || expectedSha512 !== actualSha512) fail('latest-linux.yml sha512 does not match the AppImage');
if (!metadata.includes(`version: ${appVersion}`)) fail(`latest-linux.yml does not describe version ${appVersion}`);

console.log(`verify-linux-appimage: passed (${artifact.length} bytes, SquashFS offset ${offset}, runtime ${manifest.version})`);
