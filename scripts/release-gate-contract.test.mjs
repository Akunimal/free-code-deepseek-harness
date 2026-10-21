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

test('workspace tests serialize cold CLI probes without weakening their budgets', () => {
  const rootPackage = JSON.parse(readFileSync(new URL('package.json', repositoryRoot), 'utf8'));
  assert.match(rootPackage.scripts.test, /pnpm -r --workspace-concurrency=1 /);
  assert.match(rootPackage.scripts.test, /--filter "\.\/packages\/\*\*" --filter "\.\/apps\/\*\*" test/);
  const contract = readFileSync(new URL('packages/contract-tests/tests/contract.test.ts', repositoryRoot), 'utf8');
  assert.match(contract, /timeout: 60_000/);
  const shellTests = readFileSync(new URL('apps/shell/vitest.config.ts', repositoryRoot), 'utf8');
  assert.match(shellTests, /fileParallelism:\s*false/);
});

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

  assert.match(commandText, /release-artifacts\.test\.mjs/);
  assert.match(commandText, /release-version-docs\.test\.mjs/);
  assert.match(commandText, /vendor-client-contracts\.test\.mjs/);
  assert.match(commandText, /phoenix-router-contracts\.test\.mjs/);
  assert.match(commandText, /freellmpool-staging\.test\.mjs/);
  assert.doesNotMatch(commandText, /opencode2api-staging\.test\.mjs/);
  assert.ok(plan.some(step => step.label === 'vendor-strict-typechecks'
    && step.args.join(' ').includes('tsc -b tsconfig.host.json tsconfig.client.json')));
  assert.doesNotMatch(commandText, /build:desktop|package:runtime|package-harness-update|smoke:nsis\b/);
  assert.match(commandText, /verify-pinned-runtime-asset\.mjs/);
  assert.match(commandText, /verify-nsis-package-output\.mjs/);
  assert.match(commandText, /mcp-offline-smoke\.mjs/);
  assert.doesNotMatch(commandText, /mcp-real-smoke|test:mcp:real|uvx|serena|free-search-mcp/);

  const packageStep = plan.find((step) => step.label === 'desktop-package');
  assert.ok(packageStep);
  assert.match(packageStep.args.join(' '), /package:desktop/);
  assert.equal(packageStep.env.FREECODE_RELEASE_OUTPUT, outputDir);
  assert.equal(packageStep.env.FREECODE_RELEASE_TARGETS, 'nsis');

  const staticStep = plan.find((step) => step.label === 'nsis-static-output');
  assert.ok(staticStep);
  assert.equal(staticStep.args.at(-1), join(outputDir, 'FreeCode-DeepSeek-Harness-0.9.3-win-x64-setup.exe'));

  const gateEntry = readFileSync(new URL('scripts/release-gate.mjs', repositoryRoot), 'utf8');
  assert.match(gateEntry, /test-owned hidden DSH CLI[\s\S]*fixture child processes/i);
  assert.match(gateEntry, /does not install or launch the[\s*]+FreeCode GUI/i);
});

test('release plan requires an empty-cache public runtime download smoke under packaged Electron ABI', () => {
  const outputDir = join(tmpdir(), 'freecode-release-gate-test');
  const plan = createReleaseGatePlan({ version: '0.9.5', outputDir });
  const smokeIndex = plan.findIndex(step => step.label === 'first-run-runtime-download');
  const packageIndex = plan.findIndex(step => step.label === 'desktop-package');
  const archiveIndex = plan.findIndex(step => step.label === 'pinned-runtime-asset-integrity');
  assert.ok(smokeIndex >= 0, 'release gate must run the fresh-cache runtime download smoke');
  assert.ok(smokeIndex > packageIndex && smokeIndex > archiveIndex, 'smoke must run against the exact packaged manifest after archive validation');
  const smoke = plan[smokeIndex];
  assert.equal(smoke.tool, 'electron-as-node');
  assert.deepEqual(smoke.args, ['scripts/verify-first-run-runtime-download.mjs']);
  assert.equal(smoke.env.FREECODE_RELEASE_OUTPUT, outputDir, 'smoke must read the exact package produced by this gate');
  const smokeScript = readFileSync(new URL('scripts/verify-first-run-runtime-download.mjs', repositoryRoot), 'utf8');
  assert.match(smokeScript, /ensureHarnessRuntime/);
  assert.match(smokeScript, /createHarnessUpdater/);
  assert.match(smokeScript, /mkdirSync/);
  assert.match(smokeScript, /mkdtempSync/);
  assert.match(smokeScript, /launchHiddenSync/);
  assert.match(smokeScript, /headlessHostPolicy\.configure\(join\(packagedResources, 'headless-host\.exe'\)\)/);
  assert.match(smokeScript, /--help/);
  const gateEntry = readFileSync(new URL('scripts/release-gate.mjs', repositoryRoot), 'utf8');
  assert.match(gateEntry, /function runElectronAsNode/);
  assert.match(gateEntry, /ELECTRON_RUN_AS_NODE:\s*'1'/);
  assert.match(gateEntry, /windowsHide:\s*true/);
  assert.match(gateEntry, /step\.tool === 'electron-as-node'/);
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

test('vendor steps run under the vendored pnpm pin through corepack and fail closed', () => {
  const gate = readFileSync(new URL('scripts/release-gate.mjs', repositoryRoot), 'utf8');
  const vendorPackage = JSON.parse(readFileSync(new URL('vendor/deepseek-harness/package.json', repositoryRoot), 'utf8'));
  assert.match(vendorPackage.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  assert.match(gate, /const vendorDir = 'vendor\/deepseek-harness'/);
  assert.match(gate, /args\[0\] === '--dir' && args\[1\] === vendorDir/);
  assert.match(gate, /vendorStep \? 'corepack' : pnpmCommand/);
  assert.match(gate, /must pin an exact pnpm version/);
  const plan = createReleaseGatePlan({ version: '0.0.0', outputDir: 'unused' });
  const vendorSteps = plan.filter((step) => step.args?.[0] === '--dir' && step.args[1] === 'vendor/deepseek-harness');
  assert.ok(vendorSteps.length >= 2, 'vendor typecheck and client regression steps stay in the gate');
  const regressions = plan.find((step) => step.label === 'vendor-client-regressions');
  assert.ok(regressions.args.includes('packages/client/ui-model-selection/tests/model-select.client.spec.tsx'));
});
