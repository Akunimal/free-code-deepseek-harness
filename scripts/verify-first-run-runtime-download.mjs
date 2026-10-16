#!/usr/bin/env node

import { launchHiddenSync } from '../apps/shell/dist/src/main/freecode-launcher.js';
import { headlessHostPolicy } from '../apps/shell/dist/src/main/headless-host-policy.js';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { ensureHarnessRuntime } from '../apps/shell/dist/src/main/harness-bootstrap.js';
import {
  createHarnessUpdater,
  readHarnessRuntimeRequirements,
  validateHarnessRuntime,
} from '../apps/shell/dist/src/main/harness-updater.js';
import { resolveHarnessRuntimeDir } from '../apps/shell/dist/src/main/resource-paths.js';

const releaseOutput = process.env.FREECODE_RELEASE_OUTPUT;
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`first-run-runtime-download: requires Windows x64, got ${process.platform}-${process.arch}`);
}
if (!process.versions.electron) {
  throw new Error(`first-run-runtime-download: must run under packaged Electron; got ABI ${process.versions.modules} without Electron`);
}
if (!releaseOutput) throw new Error('first-run-runtime-download: FREECODE_RELEASE_OUTPUT is required');

const packageRoot = resolve(releaseOutput);
const packagedResources = join(packageRoot, 'win-unpacked', 'resources', 'freecode');
headlessHostPolicy.configure(join(packagedResources, 'headless-host.exe'));
const packagedManifest = join(packagedResources, 'runtime-manifest.json');
const requirements = readHarnessRuntimeRequirements(packagedManifest);
const scratchRoot = mkdtempSync(join(tmpdir(), 'freecode-first-run-runtime-'));
const profileRoot = join(scratchRoot, 'profile');
const tempRoot = join(scratchRoot, 'temp');
const userDataRoot = join(profileRoot, 'AppData', 'Roaming', '@freecode', 'shell');
const runtimeRoot = resolveHarnessRuntimeDir({ packaged: true, resourcesDir: packagedResources, userDataDir: userDataRoot });

function isolatedEnvironment() {
  const environment = {};
  for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'ComSpec']) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  environment.USERPROFILE = profileRoot;
  environment.APPDATA = join(profileRoot, 'AppData', 'Roaming');
  environment.LOCALAPPDATA = join(profileRoot, 'AppData', 'Local');
  environment.HOME = profileRoot;
  environment.TEMP = tempRoot;
  environment.TMP = tempRoot;
  environment.ELECTRON_RUN_AS_NODE = '1';
  environment.CI = 'true';
  return environment;
}

function conciseOutput(value) {
  return String(value ?? '').trim().slice(-6_000);
}

try {
  mkdirSync(profileRoot, { recursive: true });
  mkdirSync(tempRoot, { recursive: true });
  if (existsSync(runtimeRoot)) throw new Error('first-run-runtime-download: scratch cache unexpectedly exists before the smoke');
  const updater = createHarnessUpdater({ resourcesDir: runtimeRoot });
  let loggedMiB = -1;
  console.log(`first-run-runtime-download: empty cache; fetching public DSH ${requirements.minimumVersion} asset for Electron ABI ${requirements.nodeModuleVersion}`);
  const result = await ensureHarnessRuntime({
    resourcesDir: runtimeRoot,
    updater,
    platform: 'win32',
    requirements,
    onProgress: progress => {
      if (progress.phase !== 'download' || progress.receivedBytes === undefined) return;
      const mib = Math.floor(progress.receivedBytes / (64 * 1024 * 1024));
      if (mib <= loggedMiB) return;
      loggedMiB = mib;
      const total = progress.totalBytes === undefined ? 'unknown total' : `${(progress.totalBytes / 1024 / 1024).toFixed(1)} MiB`;
      console.log(`first-run-runtime-download: ${(progress.receivedBytes / 1024 / 1024).toFixed(1)} MiB received (${total})`);
    },
  });
  if (result.source !== 'downloaded' || result.version !== requirements.minimumVersion) {
    throw new Error(`first-run-runtime-download: expected a fresh ${requirements.minimumVersion} download; got ${result.source} ${result.version}`);
  }

  const dshRoot = join(runtimeRoot, 'dsh');
  const manifestPath = join(runtimeRoot, 'runtime-manifest.json');
  validateHarnessRuntime(dshRoot, manifestPath, 'win32', requirements);
  const cliPath = join(dshRoot, 'apps', 'cli', 'lib', 'bin.js');
  const child = launchHiddenSync({
    executable: process.execPath, args: [cliPath, '--help'],
    cwd: profileRoot,
    env: isolatedEnvironment(),
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (child.error) throw new Error(`first-run-runtime-download: downloaded CLI did not start: ${child.error.message}\n${conciseOutput(child.stdout)}\n${conciseOutput(child.stderr)}`);
  if (child.status !== 0) {
    throw new Error(`first-run-runtime-download: downloaded CLI --help exited ${String(child.status)} (${String(child.signal)})\n${conciseOutput(child.stdout)}\n${conciseOutput(child.stderr)}`);
  }
  console.log(`first-run-runtime-download: PASS — empty cache downloaded ${result.version}, verified GitHub SHA-256/runtime manifest/Electron ABI, and hidden CLI --help exited 0.`);
} finally {
  const absoluteScratch = resolve(scratchRoot);
  const tempPrefix = resolve(tmpdir()).endsWith(sep) ? resolve(tmpdir()) : `${resolve(tmpdir())}${sep}`;
  if (!absoluteScratch.startsWith(tempPrefix)) {
    throw new Error(`first-run-runtime-download: refusing cleanup outside OS temp: ${absoluteScratch}`);
  }
  rmSync(absoluteScratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
