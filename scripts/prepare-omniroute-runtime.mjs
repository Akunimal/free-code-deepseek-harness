#!/usr/bin/env node
/**
 * Prepare the isolated OmniRoute production runtime for desktop packaging.
 * Do not run package lifecycle hooks: OmniRoute's upstream postinstall can
 * rebuild/download native modules and mutate a user's home directory. The
 * small standalone package copies it performs are recreated explicitly below.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyOmniRouteRuntime, verifyOmniRouteRuntimeArchive } from './verify-omniroute-runtime.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = join(repoRoot, 'apps', 'shell', 'omniroute-runtime');
const expectedVersion = '3.8.51';
const packagePath = join(runtimeRoot, 'package.json');
const lockPath = join(runtimeRoot, 'package-lock.json');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`prepare-omniroute-runtime: cannot read ${path}: ${error.message}`);
  }
}

const manifest = readJson(packagePath);
const lock = readJson(lockPath);
if (manifest.dependencies?.omniroute !== expectedVersion
  || lock.packages?.['']?.dependencies?.omniroute !== expectedVersion
  || lock.packages?.['node_modules/omniroute']?.version !== expectedVersion) {
  throw new Error(`prepare-omniroute-runtime: package and lock must pin omniroute ${expectedVersion}`);
}

function hasReusableInstall() {
  const nodeModulesRoot = join(runtimeRoot, 'node_modules');
  const hiddenLockPath = join(nodeModulesRoot, '.package-lock.json');
  if (!existsSync(hiddenLockPath)) return false;
  let installedLock;
  let installedOmniRoute;
  try {
    installedLock = readJson(hiddenLockPath);
    installedOmniRoute = readJson(join(nodeModulesRoot, 'omniroute', 'package.json'));
  } catch {
    return false;
  }
  if (installedOmniRoute.version !== expectedVersion
    || !existsSync(join(nodeModulesRoot, 'omniroute', 'dist', 'server.js'))) return false;

  const expectedPackages = Object.entries(lock.packages ?? {})
    .filter(([name, info]) => name && info.optional !== true);
  if (!installedLock.packages || expectedPackages.some(([name, expected]) => {
    const actual = installedLock.packages[name];
    return !actual || actual.version !== expected.version || actual.integrity !== expected.integrity;
  })) return false;

  return Object.keys(installedOmniRoute.dependencies ?? {}).every((name) =>
    existsSync(join(nodeModulesRoot, ...name.split('/'), 'package.json')));
}

const installRequired = !hasReusableInstall();

if (installRequired) {
  const npmConfigDir = mkdtempSync(join(tmpdir(), 'freecode-public-npm-'));
  const userNpmConfigPath = join(npmConfigDir, 'user.npmrc');
  const globalNpmConfigPath = join(npmConfigDir, 'global.npmrc');
  const safeNpmConfig =
    'registry=https://registry.npmjs.org/\n'
    + 'audit=false\n'
    + 'fund=false\n'
    + 'strict-ssl=true\n';
  writeFileSync(userNpmConfigPath, safeNpmConfig, 'utf8');
  writeFileSync(globalNpmConfigPath, safeNpmConfig, 'utf8');

  try {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^(?:NPM_CONFIG_|NPM_TOKEN$|NODE_AUTH_TOKEN$)/i.test(key)) delete env[key];
    }
    env.NPM_CONFIG_USERCONFIG = userNpmConfigPath;
    env.NPM_CONFIG_GLOBALCONFIG = globalNpmConfigPath;
    env.NPM_CONFIG_REGISTRY = 'https://registry.npmjs.org/';
    const result = spawnSync('npm', [
      'ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund',
      '--registry=https://registry.npmjs.org/',
    ], {
      cwd: runtimeRoot,
      env,
      encoding: 'utf8',
      stdio: 'inherit',
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`npm ci exited with status ${result.status}`);
  } finally {
    rmSync(npmConfigDir, { recursive: true, force: true });
  }
} else {
  console.log(`prepare-omniroute-runtime: reusing complete OmniRoute ${expectedVersion} production tree`);
}

const omniRoot = join(runtimeRoot, 'node_modules', 'omniroute');
if (!existsSync(join(omniRoot, 'dist', 'server.js'))) {
  throw new Error(`prepare-omniroute-runtime: OmniRoute ${expectedVersion} server entry is missing after npm ci`);
}

// Upstream's postinstall copies these pure-JS packages into the Next standalone
// search path. Reproduce only that deterministic step; never execute its
// native rebuild, browser repair, environment sync, or home-directory warmup.
const requireFromOmniRoute = createRequire(join(omniRoot, 'package.json'));
for (const packageName of ['sql.js', 'node-machine-id']) {
  const entryPath = requireFromOmniRoute.resolve(packageName);
  let packageRoot = dirname(entryPath);
  while (packageRoot !== dirname(packageRoot)) {
    const candidate = join(packageRoot, 'package.json');
    if (existsSync(candidate) && readJson(candidate).name === packageName) break;
    packageRoot = dirname(packageRoot);
  }
  if (packageRoot === dirname(packageRoot)) {
    throw new Error(`prepare-omniroute-runtime: cannot find package root for ${packageName}`);
  }
  const destination = join(omniRoot, 'dist', 'node_modules', packageName);
  cpSync(packageRoot, destination, { recursive: true, force: true });
}

const verificationErrors = verifyOmniRouteRuntime(runtimeRoot);
if (verificationErrors.length) {
  throw new Error(`prepare-omniroute-runtime: ${verificationErrors.join('; ')}`);
}

const appManifest = readJson(join(repoRoot, 'apps', 'shell', 'package.json'));
if (typeof appManifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(appManifest.version)) {
  throw new Error('prepare-omniroute-runtime: desktop app version is invalid');
}
const assetName = `omniroute-runtime-${expectedVersion}.tar.gz`;
const archiveDir = join(runtimeRoot, 'build');
const archivePath = join(archiveDir, assetName);
const descriptorPath = join(repoRoot, 'apps', 'shell', 'resources', 'freecode', 'omniroute-runtime.json');
const runtimeManifestPath = join(runtimeRoot, 'runtime-manifest.json');
const entry = 'node_modules/omniroute/dist/server.js';
mkdirSync(archiveDir, { recursive: true });
mkdirSync(dirname(descriptorPath), { recursive: true });
writeFileSync(runtimeManifestPath, `${JSON.stringify({
  schemaVersion: 1,
  version: expectedVersion,
  entry,
  engines: { node: '>=22.22.2 <23 || >=24.0.0 <27' },
  lockfileSha256: await hashFile(lockPath),
}, null, 2)}\n`, 'utf8');
rmSync(archivePath, { force: true });

const systemTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
const tarExecutable = process.platform === 'win32' && existsSync(systemTar) ? systemTar : 'tar';
const tarResult = spawnSync(tarExecutable, [
  '-czf', archivePath,
  '--format=pax',
  '-C', runtimeRoot,
  'runtime-manifest.json',
  'node_modules',
], {
  encoding: 'utf8',
  stdio: 'inherit',
  windowsHide: true,
});
if (tarResult.error) throw tarResult.error;
if (tarResult.status !== 0) throw new Error(`prepare-omniroute-runtime: tar exited with status ${tarResult.status}`);

const sha256 = await hashFile(archivePath);
const assetUrl = `https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v${appManifest.version}/${assetName}`;
writeFileSync(descriptorPath, `${JSON.stringify({
  schemaVersion: 1,
  appVersion: appManifest.version,
  version: expectedVersion,
  platform: 'any',
  assetName,
  assetUrl,
  sha256,
  sizeBytes: statSync(archivePath).size,
  entry,
}, null, 2)}\n`, 'utf8');

const descriptorErrors = await verifyOmniRouteRuntimeArchive({
  runtimeRoot,
  descriptorPath,
  archivePath,
  appVersion: appManifest.version,
});
if (descriptorErrors.length) throw new Error(`prepare-omniroute-runtime: ${descriptorErrors.join('; ')}`);

console.log(`prepare-omniroute-runtime: staged OmniRoute ${expectedVersion} runtime archive ${archivePath}`);
console.log(`prepare-omniroute-runtime: wrote first-start descriptor ${descriptorPath} (sha256 ${sha256})`);

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(path);
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolveHash(hash.digest('hex')));
  });
}
