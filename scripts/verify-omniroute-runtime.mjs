#!/usr/bin/env node
/** Fail-closed packaging contract for the staged OmniRoute runtime. */
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyOmniRouteRuntime(runtimeRoot) {
  const root = resolve(runtimeRoot);
  const manifest = readJson(join(root, 'package.json'));
  const lock = readJson(join(root, 'package-lock.json'));
  const packageRoot = join(root, 'node_modules', 'omniroute');
  const packageManifest = readJson(join(packageRoot, 'package.json'));
  const errors = [];

  if (manifest.dependencies?.omniroute !== '3.8.51') errors.push('runtime manifest must pin omniroute 3.8.51');
  if (lock.packages?.['']?.dependencies?.omniroute !== '3.8.51') errors.push('lock root must pin omniroute 3.8.51');
  if (lock.packages?.['node_modules/omniroute']?.version !== '3.8.51') errors.push('lock package must resolve omniroute 3.8.51');
  if (packageManifest.version !== '3.8.51') errors.push('installed OmniRoute package must be version 3.8.51');
  if (!existsSync(join(packageRoot, 'dist', 'server.js'))) errors.push('headless dist/server.js entry is missing');

  for (const name of ['sql.js', 'node-machine-id']) {
    if (!existsSync(join(packageRoot, 'dist', 'node_modules', name, 'package.json'))) {
      errors.push(`standalone dist/node_modules/${name} is missing`);
    }
  }

  for (const name of Object.keys(packageManifest.dependencies ?? {})) {
    const dependencyManifest = join(root, 'node_modules', ...name.split('/'), 'package.json');
    if (!existsSync(dependencyManifest)) errors.push(`production dependency is missing: ${name}`);
  }

  const nodeRange = packageManifest.engines?.node;
  if (nodeRange !== '>=22.22.2 <23 || >=24.0.0 <27') {
    errors.push(`unexpected OmniRoute Node engine contract: ${String(nodeRange)}`);
  }
  return errors;
}

export async function verifyOmniRouteRuntimeArchive({ runtimeRoot, descriptorPath, archivePath, appVersion }) {
  const errors = [];
  const descriptor = readJson(descriptorPath);
  const archive = resolve(archivePath);
  const expectedName = 'omniroute-runtime-3.8.51.tar.gz';
  const expectedUrl = `https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v${appVersion}/${expectedName}`;

  if (descriptor.version !== '3.8.51') errors.push('runtime descriptor must pin OmniRoute 3.8.51');
  if (descriptor.appVersion !== appVersion) errors.push(`runtime descriptor appVersion must be ${appVersion}`);
  if (descriptor.assetName !== expectedName) errors.push(`runtime descriptor assetName must be ${expectedName}`);
  if (descriptor.assetUrl !== expectedUrl) errors.push('runtime descriptor must use the pinned fork release asset URL');
  if (descriptor.platform !== 'any') errors.push('runtime descriptor platform must be any');
  if (descriptor.entry !== 'node_modules/omniroute/dist/server.js') errors.push('runtime descriptor headless entry is invalid');
  if (!/^[a-f0-9]{64}$/.test(descriptor.sha256 ?? '')) errors.push('runtime descriptor SHA-256 is invalid');
  if (!existsSync(archive)) errors.push(`runtime archive is missing: ${archive}`);
  if (errors.length) return errors;

  const actualSha256 = await hashFile(archive);
  if (actualSha256 !== descriptor.sha256) errors.push('runtime archive SHA-256 does not match the descriptor');
  if (descriptor.sizeBytes !== statSync(archive).size) errors.push('runtime archive size does not match the descriptor');
  const stagedManifest = readJson(join(resolve(runtimeRoot), 'runtime-manifest.json'));
  if (stagedManifest.version !== descriptor.version) errors.push('runtime archive manifest version does not match the descriptor');
  if (stagedManifest.entry !== descriptor.entry) errors.push('runtime archive manifest entry does not match the descriptor');
  return errors;
}

function hashFile(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(filePath);
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`verify-omniroute-runtime: cannot read ${path}: ${error.message}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(fileURLToPath(new URL('../apps/shell/omniroute-runtime', import.meta.url)));
  const errors = verifyOmniRouteRuntime(root);
  if (errors.length) throw new Error(`verify-omniroute-runtime: ${errors.join('; ')}`);
  if (!process.argv[2] || process.argv.length >= 6) {
    const shellRoot = resolve(fileURLToPath(new URL('../apps/shell', import.meta.url)));
    const archiveErrors = await verifyOmniRouteRuntimeArchive({
      runtimeRoot: root,
      descriptorPath: process.argv[3] ?? join(shellRoot, 'resources', 'freecode', 'omniroute-runtime.json'),
      archivePath: process.argv[4] ?? join(root, 'build', 'omniroute-runtime-3.8.51.tar.gz'),
      appVersion: process.argv[5] ?? readJson(join(shellRoot, 'package.json')).version,
    });
    if (archiveErrors.length) throw new Error(`verify-omniroute-runtime: ${archiveErrors.join('; ')}`);
  }
  console.log('verify-omniroute-runtime: OmniRoute 3.8.51 production runtime is complete');
}
