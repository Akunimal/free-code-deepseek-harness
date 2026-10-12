import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyDesktopReleaseAssets } from './verify-desktop-release-assets.mjs';

const version = '0.9.3';
const setupName = `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`;
const portableName = `FreeCode-DeepSeek-Harness-${version}-win-x64-portable.exe`;

function peFixture(label) {
  const bytes = Buffer.alloc(0x48 + Buffer.byteLength(label));
  bytes.write('MZ', 0, 'ascii');
  bytes.writeUInt32LE(0x40, 0x3c);
  bytes.write('PE\0\0', 0x40, 'binary');
  bytes.write(label, 0x44, 'utf8');
  return bytes;
}

async function createReleaseFixture() {
  const output = await mkdtemp(join(tmpdir(), 'freecode-release-assets-'));
  const setup = peFixture('test-installer');
  const portable = peFixture('test-portable');
  const unpacked = join(output, 'win-unpacked');
  await mkdir(join(unpacked, 'resources', 'freecode'), { recursive: true });
  await writeFile(join(output, setupName), setup);
  await writeFile(join(output, portableName), portable);
  await writeFile(join(output, `${setupName}.blockmap`), '{}');
  await writeFile(join(unpacked, 'FreeCode DeepSeek Harness.exe'), 'MZ-test-unpacked');
  await writeFile(join(unpacked, 'resources', 'freecode', 'runtime-manifest.json'), '{}');
  const sha512 = createHash('sha512').update(setup).digest('base64');
  await writeFile(join(output, 'latest.yml'), [
    `version: ${version}`,
    'files:',
    `  - url: ${setupName}`,
    `    sha512: ${sha512}`,
    `    size: ${setup.length}`,
    `path: ${setupName}`,
    `sha512: ${sha512}`,
    '',
  ].join('\n'));
  return { output, setup, portable };
}

test('verifies the exact NSIS and portable artifacts without launching them', async () => {
  const fixture = await createReleaseFixture();
  try {
    const result = await verifyDesktopReleaseAssets(fixture.output, version);
    assert.equal(result.setup.name, setupName);
    assert.equal(result.setup.size, fixture.setup.length);
    assert.equal(result.portable.name, portableName);
    assert.equal(result.portable.size, fixture.portable.length);
    assert.equal(result.portable.sha256, createHash('sha256').update(fixture.portable).digest('hex'));
  } finally {
    await rm(fixture.output, { recursive: true, force: true });
  }
});

test('the root package exposes the static desktop artifact verifier', async () => {
  const rootPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(rootPackage.scripts['verify:desktop-release-assets'], 'node scripts/verify-desktop-release-assets.mjs');
});

test('rejects a missing portable artifact even when setup metadata is valid', async () => {
  const fixture = await createReleaseFixture();
  try {
    await rm(join(fixture.output, portableName));
    await assert.rejects(
      verifyDesktopReleaseAssets(fixture.output, version),
      /missing.*portable|portable.*missing/i,
    );
  } finally {
    await rm(fixture.output, { recursive: true, force: true });
  }
});

test('rejects a non-PE portable artifact', async () => {
  const fixture = await createReleaseFixture();
  try {
    await writeFile(join(fixture.output, portableName), 'not-a-windows-executable');
    await assert.rejects(verifyDesktopReleaseAssets(fixture.output, version), /portable.*PE/i);
  } finally {
    await rm(fixture.output, { recursive: true, force: true });
  }
});

test('rejects updater metadata with a mismatched setup size or digest', async () => {
  const fixture = await createReleaseFixture();
  try {
    const latestPath = join(fixture.output, 'latest.yml');
    const valid = await readFile(latestPath, 'utf8');
    const wrongSize = valid.replace(`    size: ${fixture.setup.length}`, `    size: ${fixture.setup.length + 1}`);
    await writeFile(latestPath, wrongSize);
    await assert.rejects(verifyDesktopReleaseAssets(fixture.output, version), /size/i);

    await writeFile(latestPath, valid.replace(/sha512: .+/g, `sha512: ${'A'.repeat(88)}`));
    await assert.rejects(verifyDesktopReleaseAssets(fixture.output, version), /SHA-512/i);
  } finally {
    await rm(fixture.output, { recursive: true, force: true });
  }
});
