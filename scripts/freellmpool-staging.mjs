import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM_REPOSITORY = 'https://github.com/0xzr/freellmpool';
const UPSTREAM_COMMIT = 'e4411650da95edf3002c6789ccd1c816aedae1d4';
const UPSTREAM_VERSION = '0.13.0';
const UPSTREAM_TARBALL_SHA256 = '31175b80b613386550d247e89546ab312f66bf49950ebdddf3d4ee9e937e6aa6';
const BINARY = 'freellmpool-win-x64.exe';
const RECEIPT = 'freecode-build-receipt.json';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function paths(root) {
  return {
    vendor: join(root, 'vendor', 'freellmpool'),
    source: join(root, 'apps', 'shell', 'resources', 'phoenix'),
    staged: join(root, 'apps', 'shell', 'resources', 'freecode', 'phoenix'),
  };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is missing or invalid: ${path}`, { cause: error });
  }
}

function assertUpstreamPin(vendor) {
  const upstream = readJson(join(vendor, 'UPSTREAM.json'), 'FreeLLMpool upstream pin');
  if (upstream.repository !== UPSTREAM_REPOSITORY || upstream.commit !== UPSTREAM_COMMIT
    || upstream.version !== UPSTREAM_VERSION || upstream.tarballSha256 !== UPSTREAM_TARBALL_SHA256) {
    throw new Error('FreeLLMpool upstream pin does not match the reviewed immutable 0.13.0 source');
  }
  const pyproject = readFileSync(join(vendor, 'pyproject.toml'), 'utf8');
  if (!new RegExp(`^version\\s*=\\s*["']${UPSTREAM_VERSION}["']\\s*$`, 'm').test(pyproject)) {
    throw new Error('FreeLLMpool pyproject version does not match the pinned upstream version');
  }
  const versionModule = readFileSync(join(vendor, 'src', 'freellmpool', '_version.py'), 'utf8');
  if (!versionModule.includes(`__version__ = "${UPSTREAM_VERSION}"`)) {
    throw new Error('FreeLLMpool runtime version module does not match the pinned upstream version');
  }
  return upstream;
}

function assertToolchain(root, source) {
  const expected = readJson(join(root, 'scripts', 'freellmpool-build-lock.json'), 'FreeLLMpool build lock');
  const actual = readJson(join(source, 'freecode-build-metadata.json'), 'FreeLLMpool build metadata');
  for (const key of ['pythonVersion', 'architecture', 'pyinstallerVersion']) {
    if (actual[key] !== expected[key]) throw new Error(`FreeLLMpool build ${key} does not match the pinned toolchain`);
  }
  if (actual.architecture !== 'AMD64' || JSON.stringify(actual.runtime) !== JSON.stringify(expected.runtime)) {
    throw new Error('FreeLLMpool build runtime dependencies or architecture do not match the pinned toolchain');
  }
  return actual;
}

export function assertWindowsX64ConsoleExecutable(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 256 || bytes.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('Phoenix FreeLLMpool artifact is not a valid Windows PE executable');
  }
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 64 || pe + 94 > bytes.length || bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0'
    || bytes.readUInt16LE(pe + 4) !== 0x8664 || bytes.readUInt16LE(pe + 24) !== 0x20b
    || bytes.readUInt16LE(pe + 92) !== 3) {
    throw new Error('Phoenix FreeLLMpool artifact must be an x64 Windows console-subsystem executable');
  }
}

function sourceFingerprint(root, vendor, source) {
  const digest = createHash('sha256');
  const addTree = (base, directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__pycache__') addTree(base, path);
      } else if (entry.isFile()) {
        digest.update(relative(base, path).replaceAll('\\', '/')).update('\0').update(readFileSync(path)).update('\0');
      }
    }
  };
  addTree(vendor, join(vendor, 'src', 'freellmpool'));
  for (const path of [
    join(vendor, 'UPSTREAM.json'),
    join(vendor, 'LICENSE'),
    join(vendor, 'pyproject.toml'),
    join(source, 'phoenix-entry.py'),
    join(source, 'phoenix-providers.toml'),
    join(source, 'phoenix-model-ids.json'),
    join(source, 'freecode-build-metadata.json'),
    join(root, 'scripts', 'freellmpool-build-lock.json'),
    join(root, 'scripts', 'build-freellmpool.mjs'),
    join(root, 'scripts', 'phoenix-catalog.mjs'),
  ]) {
    digest.update(relative(root, path).replaceAll('\\', '/')).update('\0').update(readFileSync(path)).update('\0');
  }
  return digest.digest('hex');
}

export function stagePhoenixGateway(root) {
  const { vendor, source, staged } = paths(root);
  const upstream = assertUpstreamPin(vendor);
  const toolchain = assertToolchain(root, source);
  const binaryBytes = readFileSync(join(source, BINARY));
  assertWindowsX64ConsoleExecutable(binaryBytes);
  const modelsCatalogBytes = readFileSync(join(source, 'phoenix-model-ids.json'));
  const licenseBytes = readFileSync(join(vendor, 'LICENSE'));
  const receipt = {
    schemaVersion: 1,
    upstream: {
      repository: upstream.repository,
      commit: upstream.commit,
      version: upstream.version,
      tarballSha256: upstream.tarballSha256,
    },
    sourceSha256: sourceFingerprint(root, vendor, source),
    binarySha256: sha256(binaryBytes),
    modelsCatalogSha256: sha256(modelsCatalogBytes),
    licenseSha256: sha256(licenseBytes),
    toolchain,
  };
  mkdirSync(staged, { recursive: true });
  writeFileSync(join(source, RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`);
  copyFileSync(join(source, BINARY), join(staged, BINARY));
  copyFileSync(join(source, RECEIPT), join(staged, RECEIPT));
  copyFileSync(join(source, 'phoenix-model-ids.json'), join(staged, 'phoenix-model-ids.json'));
  copyFileSync(join(vendor, 'LICENSE'), join(staged, 'LICENSE'));
  return { commit: upstream.commit, version: upstream.version, binarySha256: receipt.binarySha256 };
}

export function verifyPhoenixGateway(root) {
  const { vendor, source, staged } = paths(root);
  const upstream = assertUpstreamPin(vendor);
  const toolchain = assertToolchain(root, source);
  const receipt = readJson(join(staged, RECEIPT), 'staged Phoenix build receipt');
  if (receipt.schemaVersion !== 1 || receipt.upstream?.commit !== upstream.commit
    || receipt.upstream?.version !== upstream.version || receipt.upstream?.tarballSha256 !== upstream.tarballSha256
    || receipt.sourceSha256 !== sourceFingerprint(root, vendor, source)) {
    throw new Error('Phoenix FreeLLMpool source fingerprint changed; rebuild and restage before packaging');
  }
  if (JSON.stringify(receipt.toolchain) !== JSON.stringify(toolchain)) {
    throw new Error('Phoenix FreeLLMpool build receipt has a stale toolchain');
  }
  const sourceBytes = readFileSync(join(source, BINARY));
  const stagedBytes = readFileSync(join(staged, BINARY));
  assertWindowsX64ConsoleExecutable(sourceBytes);
  assertWindowsX64ConsoleExecutable(stagedBytes);
  if (receipt.binarySha256 !== sha256(sourceBytes) || receipt.binarySha256 !== sha256(stagedBytes)) {
    throw new Error('Phoenix FreeLLMpool staged binary is stale; rebuild and restage the gateway');
  }
  const modelsCatalogBytes = readFileSync(join(source, 'phoenix-model-ids.json'));
  const stagedCatalogBytes = readFileSync(join(staged, 'phoenix-model-ids.json'));
  if (receipt.modelsCatalogSha256 !== sha256(modelsCatalogBytes)
    || receipt.modelsCatalogSha256 !== sha256(stagedCatalogBytes)) {
    throw new Error('Phoenix model ID allowlist is missing or stale; rebuild and restage the gateway');
  }
  const licenseBytes = readFileSync(join(vendor, 'LICENSE'));
  if (receipt.licenseSha256 !== sha256(licenseBytes)
    || receipt.licenseSha256 !== sha256(readFileSync(join(staged, 'LICENSE')))) {
    throw new Error('Phoenix FreeLLMpool license is missing or stale');
  }
  return { ok: true, commit: upstream.commit, version: upstream.version, binarySha256: receipt.binarySha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  if (process.argv[2] === '--verify') verifyPhoenixGateway(root);
  else if (process.argv[2] === '--stage-built') stagePhoenixGateway(root);
  else throw new Error('use --verify or --stage-built (after the pinned PyInstaller build)');
  console.log('Phoenix FreeLLMpool staging: verified');
}
