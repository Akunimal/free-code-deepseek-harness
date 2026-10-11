#!/usr/bin/env node
/**
 * Fail closed when the Electron-embedded Node runtime cannot satisfy the
 * engine range declared by the staged DSH runtime.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const shellRequire = createRequire(join(root, 'apps', 'shell', 'package.json'));
const semver = shellRequire('semver');

export function nodeVersionSatisfiesEngine(version, range) {
  if (typeof version !== 'string' || typeof range !== 'string') return false;
  if (!semver.valid(version) || !semver.validRange(range)) return false;
  return semver.satisfies(version, range);
}

export function verifyDshNodeEngine(runtimeDir = join(root, 'apps', 'shell', 'resources', 'freecode', 'dsh')) {
  const manifestPath = join(runtimeDir, 'package.json');
  if (!existsSync(manifestPath)) {
    console.error(`verify-dsh-node-engine: DSH manifest not found: ${manifestPath}`);
    return 2;
  }

  const electronBinary = shellRequire('electron');
  if (!existsSync(electronBinary)) {
    console.error(`verify-dsh-node-engine: Electron binary not found: ${electronBinary}`);
    return 2;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`verify-dsh-node-engine: invalid DSH manifest: ${String(error)}`);
    return 2;
  }
  const engineRange = manifest.engines?.node;
  if (typeof engineRange !== 'string' || !semver.validRange(engineRange)) {
    console.error(`verify-dsh-node-engine: missing or invalid engines.node in ${manifestPath}`);
    return 2;
  }

  const probe = spawnSync(electronBinary, ['-p', 'process.version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  if (probe.error || probe.status !== 0) {
    console.error(`verify-dsh-node-engine: Electron runtime probe failed (status=${String(probe.status)}): ${probe.error?.message ?? probe.stderr ?? ''}`);
    return 2;
  }

  const nodeVersion = probe.stdout.trim();
  if (!nodeVersionSatisfiesEngine(nodeVersion, engineRange)) {
    console.error(`verify-dsh-node-engine: FAIL — packaged Electron Node ${nodeVersion || '(empty)'} does not satisfy DSH engines.node ${engineRange}`);
    return 1;
  }

  console.log(`verify-dsh-node-engine: PASS — packaged Electron Node ${nodeVersion} satisfies DSH engines.node ${engineRange}`);
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = verifyDshNodeEngine(process.argv[2]);
}
