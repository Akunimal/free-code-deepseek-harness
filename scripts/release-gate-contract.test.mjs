import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createReleaseGatePlan } from './release-gate-plan.mjs';
import { assertRuntimeArchiveDestinationIsFree } from './runtime-archive-policy.mjs';
import { verifyRuntimeArchive } from './runtime-archive-verification.mjs';
import { verifyNsisPackageOutput } from './verify-nsis-package-output.mjs';

const repositoryRoot = new URL('../', import.meta.url);

function createPeFixture(label) {
  const bytes = Buffer.alloc(0x48 + Buffer.byteLength(label));
  bytes.write('MZ', 0, 'ascii');
  bytes.writeUInt32LE(0x40, 0x3c);
  bytes.write('PE\0\0', 0x40, 'binary');
  bytes.write(label, 0x44, 'utf8');
  return bytes;
}

function createNsisFixture(directory, version) {
  const setupName = `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`;
  const setupPath = join(directory, setupName);
  const bytes = createPeFixture('fake-release-installer');
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  writeFileSync(setupPath, bytes);
  writeFileSync(`${setupPath}.blockmap`, 'blockmap');
  mkdirSync(join(directory, 'win-unpacked', 'resources', 'freecode'), { recursive: true });
  writeFileSync(join(directory, 'win-unpacked', 'FreeCode DeepSeek Harness.exe'), 'MZ');
  writeFileSync(join(directory, 'win-unpacked', 'resources', 'freecode', 'runtime-manifest.json'), '{"version":"0.2.1-alpha.2"}');
  writeFileSync(join(directory, 'latest.yml'), [
    `version: ${version}`,
    'files:',
    `  - url: ${setupName}`,
    `    sha512: ${sha512}`,
    `    size: ${bytes.length}`,
    `path: ${setupName}`,
    `sha512: ${sha512}`,
  ].join('\n'));
  return { setupPath, bytes, sha512 };
}

test('desktop packaging stays separate from immutable runtime archive generation', () => {
  const rootPackage = JSON.parse(readFileSync(new URL('package.json', repositoryRoot), 'utf8'));
  const shellPackage = JSON.parse(readFileSync(new URL('apps/shell/package.json', repositoryRoot), 'utf8'));

  assert.doesNotMatch(shellPackage.scripts.package, /package-harness-update/);
  assert.doesNotMatch(rootPackage.scripts['build:desktop'], /package:runtime/);
  assert.match(rootPackage.scripts['package:runtime:release'], /package:runtime/);
  assert.match(rootPackage.scripts['package:runtime:release'], /package-harness-update/);
});

test('desktop packaging relies on the preflight ABI check and skips Electron header rebuilds', () => {
  const packageDesktop = readFileSync(new URL('scripts/package-desktop.mjs', repositoryRoot), 'utf8');
  assert.match(packageDesktop, /--config\.npmRebuild=false/);
});

test('release plan statically validates an isolated NSIS build without install or runtime rebuild', () => {
  const outputDir = join(tmpdir(), 'freecode-release-gate-test');
  const plan = createReleaseGatePlan({ version: '0.9.3', outputDir });
  const commandText = plan.map((step) => `${step.label} ${step.args.join(' ')}`).join('\n');

  assert.doesNotMatch(commandText, /build:desktop|package:runtime|package-harness-update|smoke:nsis\b/);
  assert.match(commandText, /verify-pinned-runtime-asset\.mjs/);
  assert.match(commandText, /verify-nsis-package-output\.mjs/);
  assert.match(commandText, /test:mcp:real/);

  const packageStep = plan.find((step) => step.label === 'desktop-package');
  assert.ok(packageStep);
  assert.match(packageStep.args.join(' '), /package:desktop/);
  assert.equal(packageStep.env.FREECODE_RELEASE_OUTPUT, outputDir);
  assert.equal(packageStep.env.FREECODE_RELEASE_TARGETS, 'nsis');

  const staticStep = plan.find((step) => step.label === 'nsis-static-output');
  assert.ok(staticStep);
  assert.equal(staticStep.args.at(-1), join(outputDir, 'FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe'));
});

test('pinned runtime archive is verified by its recorded digest and filename', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'freecode-runtime-archive-test-'));
  try {
    const version = '0.2.1-alpha.2';
    const name = `deepseek-harness-runtime-${version}-win32-x64.tar.gz`;
    const archivePath = join(temp, name);
    const checksumPath = `${archivePath}.sha256`;
    const manifestPath = join(temp, 'runtime-manifest.json');
    const bytes = Buffer.from('fixture runtime archive');
    const digest = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(archivePath, bytes);
    writeFileSync(checksumPath, `${digest}  ${name}\n`);
    writeFileSync(manifestPath, JSON.stringify({ version, nodeModuleVersion: '149' }));

    const result = await verifyRuntimeArchive({ archivePath, checksumPath, manifestPath, platform: 'win32', arch: 'x64' });
    assert.equal(result.version, version);
    assert.equal(result.digest, digest);
    assert.equal(result.assetName, name);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('runtime archive verification rejects checksum and version mismatch', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'freecode-runtime-archive-invalid-test-'));
  try {
    const name = 'deepseek-harness-runtime-0.2.1-alpha.2-win32-x64.tar.gz';
    const archivePath = join(temp, name);
    const checksumPath = `${archivePath}.sha256`;
    const manifestPath = join(temp, 'runtime-manifest.json');
    writeFileSync(archivePath, 'archive');
    writeFileSync(checksumPath, `${'0'.repeat(64)}  ${name}\n`);
    writeFileSync(manifestPath, JSON.stringify({ version: '0.2.1-alpha.2', nodeModuleVersion: '149' }));

    await assert.rejects(verifyRuntimeArchive({ archivePath, checksumPath, manifestPath, platform: 'win32', arch: 'x64' }), /SHA-256 mismatch/);
    await assert.rejects(verifyRuntimeArchive({ archivePath, checksumPath, manifestPath, platform: 'linux', arch: 'x64' }), /asset name does not match/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('runtime archive writer refuses to replace an existing immutable version', () => {
  const temp = mkdtempSync(join(tmpdir(), 'freecode-runtime-archive-policy-test-'));
  try {
    const archivePath = join(temp, 'runtime.tar.gz');
    const checksumPath = `${archivePath}.sha256`;
    assert.doesNotThrow(() => assertRuntimeArchiveDestinationIsFree(archivePath, checksumPath));

    writeFileSync(archivePath, 'published runtime');
    assert.throws(() => assertRuntimeArchiveDestinationIsFree(archivePath, checksumPath), /refusing to overwrite/i);
    rmSync(archivePath);
    writeFileSync(checksumPath, 'published checksum');
    assert.throws(() => assertRuntimeArchiveDestinationIsFree(archivePath, checksumPath), /refusing to overwrite/i);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('NSIS output verifier validates exact package metadata without launching setup', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'freecode-nsis-output-test-'));
  try {
    const version = '0.9.3';
    const { setupPath, bytes, sha512 } = createNsisFixture(temp, version);

    const result = await verifyNsisPackageOutput(setupPath, version);
    assert.equal(result.size, bytes.length);
    assert.equal(result.sha512, sha512);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('NSIS output verifier rejects wrong setup version and bundled DSH', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'freecode-nsis-output-invalid-test-'));
  try {
    const wrongSetup = join(temp, 'FreeCode-DeepSeek-Harness-0.9.2-win-x64-setup.exe');
    writeFileSync(wrongSetup, 'MZ');
    await assert.rejects(verifyNsisPackageOutput(wrongSetup, '0.9.3'), /expected FreeCode-DeepSeek-Harness-0\.9\.3/);

    const validFixture = mkdtempSync(join(temp, 'dsh-present-'));
    const { setupPath } = createNsisFixture(validFixture, '0.9.3');
    mkdirSync(join(validFixture, 'win-unpacked', 'resources', 'freecode', 'dsh'), { recursive: true });
    await assert.rejects(verifyNsisPackageOutput(setupPath, '0.9.3'), /DSH runtime payload must remain a separate release asset/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('NSIS output verifier rejects a truncated MZ stub without a PE signature', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'freecode-nsis-output-invalid-pe-test-'));
  try {
    const { setupPath } = createNsisFixture(temp, '0.9.3');
    const invalid = Buffer.from('MZnot-a-pe');
    const sha512 = createHash('sha512').update(invalid).digest('base64');
    writeFileSync(setupPath, invalid);
    writeFileSync(join(temp, 'latest.yml'), [
      'version: 0.9.3',
      `path: ${setupPath.split(/[\\/]/).at(-1)}`,
      `sha512: ${sha512}`,
      `size: ${invalid.length}`,
    ].join('\n'));
    await assert.rejects(verifyNsisPackageOutput(setupPath, '0.9.3'), /PE header|PE signature/i);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
