#!/usr/bin/env node
/**
 * Rebuild the vendored Harness runtime's native addons for the Electron ABI
 * that will execute dsh. The runtime is launched with ELECTRON_RUN_AS_NODE=1;
 * a normal Node install is not ABI-compatible with Electron just because both
 * report a Node 22/24 version.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { findFsExtDirectory } from './runtime-native-modules.mjs';

const root = resolve(import.meta.dirname, '..');
const runtimeDir = resolve(process.argv[2] ?? join(root, 'apps', 'shell', 'resources', 'freecode', 'dsh'));
const electronPackage = join(root, 'apps', 'shell', 'node_modules', 'electron', 'package.json');
const electronPackageDir = dirname(electronPackage);
const electronInstallScript = join(electronPackageDir, 'install.js');
const pnpmStore = join(root, 'node_modules', '.pnpm');
const rebuildCandidates = [
  {
    cli: join(root, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js'),
    packageJson: join(root, 'node_modules', '@electron', 'rebuild', 'package.json'),
  },
  ...(existsSync(pnpmStore) ? readdirSync(pnpmStore)
    .filter((entry) => entry.startsWith('@electron+rebuild@'))
    .map((entry) => ({
      cli: join(pnpmStore, entry, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js'),
      packageJson: join(pnpmStore, entry, 'node_modules', '@electron', 'rebuild', 'package.json'),
    })) : []),
];
const rebuildCandidate = rebuildCandidates
  .filter((candidate) => existsSync(candidate.cli) && existsSync(candidate.packageJson))
  .sort((left, right) => {
    const leftVersion = JSON.parse(readFileSync(left.packageJson, 'utf8')).version ?? '0.0.0';
    const rightVersion = JSON.parse(readFileSync(right.packageJson, 'utf8')).version ?? '0.0.0';
    const leftParts = leftVersion.split('.').map(Number);
    const rightParts = rightVersion.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
      if ((rightParts[index] ?? 0) !== (leftParts[index] ?? 0)) {
        return (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
      }
    }
    return 0;
  })[0];
const rebuildCli = rebuildCandidate?.cli;
const rebuildVersion = rebuildCandidate
  ? JSON.parse(readFileSync(rebuildCandidate.packageJson, 'utf8')).version
  : undefined;
const rebuildPackage = rebuildCandidate
  ? JSON.parse(readFileSync(rebuildCandidate.packageJson, 'utf8'))
  : undefined;
const nodeGypCandidates = [
  join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
  ...(existsSync(pnpmStore) ? readdirSync(pnpmStore)
    .filter((entry) => entry.startsWith('node-gyp@'))
    .map((entry) => join(pnpmStore, entry, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')) : []),
];
const nodeGypCli = nodeGypCandidates.find((candidate) => existsSync(candidate));

if (!existsSync(runtimeDir)) throw new Error(`rebuild-runtime-native: runtime directory not found: ${runtimeDir}`);
if (!existsSync(electronPackage)) throw new Error(`rebuild-runtime-native: Electron package metadata not found: ${electronPackage}`);
if (!rebuildCli) throw new Error(`rebuild-runtime-native: @electron/rebuild is not installed; checked ${rebuildCandidates.map((candidate) => candidate.cli).join(', ')}`);
if (!nodeGypCli) throw new Error(`rebuild-runtime-native: node-gyp is not installed; checked ${nodeGypCandidates.join(', ')}`);

const electronVersion = JSON.parse(readFileSync(electronPackage, 'utf8')).version;
if (typeof electronVersion !== 'string' || electronVersion.length === 0) {
  throw new Error(`rebuild-runtime-native: invalid Electron version in ${electronPackage}`);
}

// @electron/rebuild writes the target ABI into this generated metadata. Read
// that value instead of importing node-abi as an undeclared root dependency;
// the same script must run from the Windows and WSL dependency layouts.
const fsExtDir = findFsExtDirectory(runtimeDir);
const hasFsExt = fsExtDir !== undefined;
const fsExtPath = join(runtimeDir, 'node_modules', 'fs-ext');
const fsExtBinary = join(fsExtPath, 'build', 'Release', 'fs_ext.node');
const fsExtConfig = join(fsExtPath, 'build', 'config.gypi');

// The materialized runtime intentionally flattens workspace packages, so
// @electron/rebuild may not discover fs-ext by walking package.json links.
// Resolve the ABI through the node-abi dependency selected by the rebuild
// tool instead of trusting host-Node-generated config.gypi metadata.
const nodeAbiSpec = rebuildPackage?.dependencies?.['node-abi'];
const nodeAbiMajorMatch = typeof nodeAbiSpec === 'string' ? nodeAbiSpec.match(/(\d+)/) : undefined;
const nodeAbiMajor = nodeAbiMajorMatch ? Number(nodeAbiMajorMatch[1]) : undefined;
const nodeAbiCandidates = existsSync(pnpmStore) ? readdirSync(pnpmStore)
  .filter((entry) => entry.startsWith('node-abi@'))
  .map((entry) => {
    const packageJson = join(pnpmStore, entry, 'node_modules', 'node-abi', 'package.json');
    const modulePath = join(pnpmStore, entry, 'node_modules', 'node-abi');
    if (!existsSync(packageJson) || !existsSync(modulePath)) return undefined;
    return {
      modulePath,
      version: JSON.parse(readFileSync(packageJson, 'utf8')).version ?? '0.0.0',
    };
  })
  .filter((candidate) => candidate && (nodeAbiMajor === undefined || Number(candidate.version.split('.')[0]) === nodeAbiMajor))
  .sort((left, right) => {
    const leftParts = left.version.split('.').map(Number);
    const rightParts = right.version.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
      if ((rightParts[index] ?? 0) !== (leftParts[index] ?? 0)) {
        return (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
      }
    }
    return 0;
  }) : [];
const nodeAbiCandidate = nodeAbiCandidates[0];
if (!nodeAbiCandidate) {
  throw new Error(`rebuild-runtime-native: node-abi ${nodeAbiSpec ?? '(unknown)'} is not installed in ${pnpmStore}`);
}
const nodeAbi = createRequire(import.meta.url)(nodeAbiCandidate.modulePath);

console.log(`rebuild-runtime-native: rebuilding ${runtimeDir} for Electron ${electronVersion}`);
console.log(`rebuild-runtime-native: using @electron/rebuild ${rebuildVersion ?? 'unknown'} at ${rebuildCli}`);
const electronAbi = Number(nodeAbi.getAbi(electronVersion, 'electron'));
if (!Number.isInteger(electronAbi) || electronAbi <= 0) {
  throw new Error(`rebuild-runtime-native: node-abi could not resolve Electron ${electronVersion}`);
}
console.log(`rebuild-runtime-native: node-abi ${nodeAbiCandidate.version} resolves Electron ABI ${electronAbi}`);
const result = spawnSync(process.execPath, [rebuildCli,
  '--version', electronVersion,
  '--module-dir', runtimeDir,
  '--force',
  '--sequential',
], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, npm_config_build_from_source: 'true' },
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`rebuild-runtime-native: Electron native rebuild failed with exit code ${String(result.status)}`);
}

// @electron/rebuild can report success without visiting a transitive package
// that already contains a host-Node binary. When fs-ext is present in the
// runtime closure, rebuild it explicitly and verify its binary and Electron ABI.
if (hasFsExt) {
  console.log(`rebuild-runtime-native: forcing fs-ext rebuild with Electron headers (ABI ${electronAbi})`);
  const nativeResult = spawnSync(process.execPath, [nodeGypCli, 'rebuild', '--directory', fsExtDir, `--runtime=electron`, `--target=${electronVersion}`], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      npm_config_build_from_source: 'true',
      npm_config_dist_url: 'https://electronjs.org/headers',
      npm_config_runtime: 'electron',
      npm_config_target: electronVersion,
    },
  });
  if (nativeResult.error) throw nativeResult.error;
  if (nativeResult.status !== 0) {
    throw new Error(`rebuild-runtime-native: fs-ext native rebuild failed with exit code ${String(nativeResult.status)}`);
  }
  if (!existsSync(fsExtBinary)) {
    throw new Error(`rebuild-runtime-native: fs-ext rebuild reported success but produced no binary: ${fsExtBinary}`);
  }
  if (!existsSync(fsExtConfig)) {
    throw new Error(`rebuild-runtime-native: fs-ext rebuild reported success but produced no config metadata: ${fsExtConfig}`);
  }
} else {
  console.log(`rebuild-runtime-native: fs-ext is not present in the runtime closure; skipping its explicit rebuild/load probe`);
}

// node-gyp's generated config.gypi may retain the host Node module version
// even when it compiled against Electron headers. The only meaningful check is
// loading the produced addon through the exact Electron executable shipped by
// the app, under the same ELECTRON_RUN_AS_NODE=1 mode used by dsh.
const electronBinary = join(root, 'apps', 'shell', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
if (hasFsExt && !existsSync(electronBinary)) {
  // pnpm can restore Electron's package metadata without its postinstall
  // artifact (for example after an interrupted dependency cache restore).
  // Materialize the official package binary before the ABI load probe instead
  // of reporting a misleading native-addon failure.
  if (!existsSync(electronInstallScript)) {
    throw new Error(`rebuild-runtime-native: Electron binary is missing and its installer is unavailable: ${electronBinary}`);
  }
  console.log(`rebuild-runtime-native: Electron binary missing; running ${electronInstallScript}`);
  const installResult = spawnSync(process.execPath, [electronInstallScript], {
    cwd: electronPackageDir,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env },
  });
  if (installResult.error) throw installResult.error;
  if (installResult.status !== 0 || !existsSync(electronBinary)) {
    throw new Error(`rebuild-runtime-native: Electron package installer did not produce ${electronBinary}`);
  }
}
if (hasFsExt && !existsSync(electronBinary)) {
  throw new Error(`rebuild-runtime-native: Electron executable not found for load probe: ${electronBinary}`);
}
if (hasFsExt) {
  const loadProbe = spawnSync(electronBinary, ['-e', [
    `const addon = require(${JSON.stringify(fsExtDir)});`,
    `process.stdout.write(JSON.stringify({ loaded: Boolean(addon), node: process.versions.node, modules: process.versions.modules }));`,
  ].join(' ')], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  if (loadProbe.error) throw loadProbe.error;
  if (loadProbe.status !== 0) {
    throw new Error(`rebuild-runtime-native: Electron fs-ext load probe failed with exit code ${String(loadProbe.status)}\n${loadProbe.stderr ?? ''}`);
  }
  let loadProbeResult;
  try {
    loadProbeResult = JSON.parse(loadProbe.stdout);
  } catch (error) {
    throw new Error(`rebuild-runtime-native: Electron fs-ext load probe returned invalid JSON: ${loadProbe.stdout}`, { cause: error });
  }
  if (!loadProbeResult.loaded || Number(loadProbeResult.modules) !== electronAbi) {
    throw new Error(`rebuild-runtime-native: Electron fs-ext load probe ABI mismatch; expected ${electronAbi}, got ${loadProbe.stdout}`);
  }

  console.log(`rebuild-runtime-native: Electron ${electronVersion} native ABI rebuild passed for fs-ext`);
}
