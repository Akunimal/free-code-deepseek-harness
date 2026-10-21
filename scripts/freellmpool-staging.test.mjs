import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { stagePhoenixGateway, verifyPhoenixGateway } from './freellmpool-staging.mjs';

const PINNED_COMMIT = 'e4411650da95edf3002c6789ccd1c816aedae1d4';

function makePeX64() {
  const bytes = Buffer.alloc(512);
  bytes.write('MZ', 0, 'ascii');
  bytes.writeUInt32LE(128, 0x3c);
  bytes.write('PE\0\0', 128, 'ascii');
  bytes.writeUInt16LE(0x8664, 132);
  bytes.writeUInt16LE(0x20b, 152);
  bytes.writeUInt16LE(3, 220); // console subsystem
  return bytes;
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'freecode-phoenix-stage-'));
  const vendor = join(root, 'vendor', 'freellmpool');
  const source = join(root, 'apps', 'shell', 'resources', 'phoenix');
  mkdirSync(join(vendor, 'src', 'freellmpool'), { recursive: true });
  mkdirSync(source, { recursive: true });
  writeFileSync(join(vendor, 'UPSTREAM.json'), JSON.stringify({
    repository: 'https://github.com/0xzr/freellmpool',
    commit: PINNED_COMMIT,
    version: '0.13.0',
    tarballSha256: '31175b80b613386550d247e89546ab312f66bf49950ebdddf3d4ee9e937e6aa6',
  }));
  writeFileSync(join(vendor, 'LICENSE'), 'MIT license fixture\n');
  writeFileSync(join(vendor, 'pyproject.toml'), '[project]\nname = "freellmpool"\nversion = "0.13.0"\n');
  writeFileSync(join(vendor, 'src', 'freellmpool', '_version.py'), '__version__ = "0.13.0"\n');
  writeFileSync(join(vendor, 'src', 'freellmpool', 'providers.toml'), '[[provider]]\nid = "ovh"\n');
  writeFileSync(join(source, 'phoenix-entry.py'), 'from freellmpool import Pool\n');
  writeFileSync(join(source, 'phoenix-providers.toml'), '[[provider]]\nid = "ovh"\n');
  writeFileSync(join(source, 'phoenix-model-ids.json'), '["auto","ovh/model"]\n');
  const toolchain = {
    pythonVersion: '3.14.2',
    architecture: 'AMD64',
    pyinstallerVersion: '6.20.0',
    runtime: {
      httpx: '0.28.1', httpcore: '1.0.9', anyio: '4.14.2', certifi: '2026.7.22',
      idna: '3.18', sniffio: '1.3.1', h11: '0.16.0',
    },
  };
  writeFileSync(join(source, 'freecode-build-metadata.json'), JSON.stringify(toolchain));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'scripts', 'freellmpool-build-lock.json'), JSON.stringify(toolchain));
  writeFileSync(join(root, 'scripts', 'build-freellmpool.mjs'), 'pinned build fixture\n');
  writeFileSync(join(root, 'scripts', 'phoenix-catalog.mjs'), 'catalog generator fixture\n');
  writeFileSync(join(source, 'freellmpool-win-x64.exe'), makePeX64());
  return root;
}

test('stages the pinned self-contained Phoenix runtime with license and matching receipt', (t) => {
  const root = makeFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = stagePhoenixGateway(root);
  const staged = join(root, 'apps', 'shell', 'resources', 'freecode', 'phoenix');
  assert.equal(result.commit, PINNED_COMMIT);
  assert.equal(verifyPhoenixGateway(root).ok, true);
  assert.deepEqual(readFileSync(join(staged, 'freellmpool-win-x64.exe')), makePeX64());
  assert.match(readFileSync(join(staged, 'LICENSE'), 'utf8'), /MIT license fixture/);
  assert.deepEqual(JSON.parse(readFileSync(join(staged, 'phoenix-model-ids.json'), 'utf8')), ['auto', 'ovh/model']);
  assert.equal(JSON.parse(readFileSync(join(staged, 'freecode-build-receipt.json'), 'utf8')).upstream.commit, PINNED_COMMIT);
});

test('rejects a changed source tree after staging', (t) => {
  const root = makeFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  stagePhoenixGateway(root);
  writeFileSync(join(root, 'vendor', 'freellmpool', 'src', 'freellmpool', 'providers.toml'), 'changed\n');
  assert.throws(() => verifyPhoenixGateway(root), /source fingerprint/i);
});

test('rejects a tampered staged Phoenix model allowlist', (t) => {
  const root = makeFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  stagePhoenixGateway(root);
  writeFileSync(join(root, 'apps', 'shell', 'resources', 'freecode', 'phoenix', 'phoenix-model-ids.json'), '["auto","openai/paid"]\n');
  assert.throws(() => verifyPhoenixGateway(root), /allowlist.*stale/i);
});

test('rejects an invalid or non-x64 runtime instead of staging it', (t) => {
  const root = makeFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'apps', 'shell', 'resources', 'phoenix', 'freellmpool-win-x64.exe'), Buffer.from('not an exe'));
  assert.throws(() => stagePhoenixGateway(root), /PE|Windows x64|executable/i);
});
