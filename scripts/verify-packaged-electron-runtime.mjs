#!/usr/bin/env node
/**
 * Fail the package while electron-builder still owns appOutDir if the executable
 * it copied is stale or embeds a Node runtime incompatible with staged DSH.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'apps', 'shell', 'package.json'));
const semver = require('semver');

function defaultProbeRuntime(executablePath) {
  const probe = spawnSync(executablePath, [
    '-p',
    'JSON.stringify({ electronVersion: process.versions.electron, nodeVersion: process.version })',
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  if (probe.error || probe.status !== 0) {
    throw new Error(`Electron probe failed (status=${String(probe.status)}): ${probe.error?.message ?? probe.stderr ?? ''}`);
  }
  try {
    const runtime = JSON.parse(probe.stdout.trim());
    if (typeof runtime.electronVersion !== 'string' || typeof runtime.nodeVersion !== 'string') {
      throw new Error('Electron probe returned no Electron/Node version');
    }
    return runtime;
  } catch (error) {
    throw new Error(`Electron probe returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verify the actual executable electron-builder copied into appOutDir.
 * probeRuntime is injectable so the policy can be tested without launching an
 * Electron process. The afterPack hook uses the bounded real probe.
 */
export function verifyPackagedElectronRuntime(options) {
  const appOutDir = resolve(options.appOutDir);
  const executableName = options.executableName;
  const executablePath = join(appOutDir, executableName);
  const runtimeDir = resolve(options.runtimeDir ?? join(root, 'apps', 'shell', 'resources', 'freecode', 'dsh'));
  const probeRuntime = options.probeRuntime ?? defaultProbeRuntime;
  const fail = (error) => ({ ok: false, error, executablePath });

  if (!executableName || !existsSync(executablePath)) {
    return fail(`Packaged Electron executable not found: ${executablePath}`);
  }

  const manifestPath = join(runtimeDir, 'package.json');
  if (!existsSync(manifestPath)) return fail(`Staged DSH manifest not found: ${manifestPath}`);
  let engineRange;
  try {
    engineRange = JSON.parse(readFileSync(manifestPath, 'utf8')).engines?.node;
  } catch (error) {
    return fail(`Could not read staged DSH engine manifest: ${String(error)}`);
  }
  if (typeof engineRange !== 'string' || !semver.validRange(engineRange)) {
    return fail(`Staged DSH engines.node is missing or invalid: ${String(engineRange)}`);
  }

  let expectedElectronVersion = options.expectedElectronVersion;
  if (expectedElectronVersion === undefined) {
    try {
      expectedElectronVersion = JSON.parse(readFileSync(
        join(root, 'apps', 'shell', 'node_modules', 'electron', 'package.json'), 'utf8',
      )).version;
    } catch (error) {
      return fail(`Could not read the installed Electron dependency version: ${String(error)}`);
    }
  }
  if (typeof expectedElectronVersion !== 'string' || !semver.valid(expectedElectronVersion)) {
    return fail(`Expected Electron version is missing or invalid: ${String(expectedElectronVersion)}`);
  }

  let runtime;
  try {
    runtime = probeRuntime(executablePath);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (runtime.electronVersion !== expectedElectronVersion) {
    return fail(`Packaged Electron ${runtime.electronVersion} does not match dependency ${expectedElectronVersion}`);
  }
  if (!semver.valid(runtime.nodeVersion) || !semver.satisfies(runtime.nodeVersion, engineRange)) {
    return fail(`Packaged Electron Node ${runtime.nodeVersion} does not satisfy DSH engines.node ${engineRange}`);
  }
  return {
    ok: true,
    executablePath,
    electronVersion: runtime.electronVersion,
    nodeVersion: runtime.nodeVersion,
    engineRange,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [appOutDir, executableName] = process.argv.slice(2);
  if (!appOutDir || !executableName) {
    console.error('Usage: verify-packaged-electron-runtime.mjs <appOutDir> <executableName>');
    process.exitCode = 2;
  } else {
    const result = verifyPackagedElectronRuntime({ appOutDir, executableName });
    if (!result.ok) {
      console.error(`verify-packaged-electron-runtime: FAIL — ${result.error}`);
      process.exitCode = 1;
    } else {
      console.log(`verify-packaged-electron-runtime: PASS — Electron ${result.electronVersion}, Node ${result.nodeVersion} satisfies DSH ${result.engineRange}`);
    }
  }
}
