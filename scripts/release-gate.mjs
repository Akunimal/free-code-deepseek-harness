#!/usr/bin/env node
/**
 * Required non-interactive Windows release gate.
 *
 * It builds an NSIS artifact under a unique temporary output path, verifies
 * that exact package statically. It may start only test-owned hidden DSH CLI
 * and fixture child processes in scratch; it does not install or launch the
 * FreeCode GUI. The pinned DSH runtime is validated in place and is never
 * regenerated here.
 * Interactive installer/runtime smoke is a separate, opt-in disposable-VM
 * check because NSIS uses user-profile shortcuts and registration state.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createReleaseGatePlan } from './release-gate-plan.mjs';

if (process.platform !== 'win32') {
  console.error('release-gate: Windows desktop release verification requires Windows; refusing to report green.');
  process.exit(2);
}

const root = resolve(import.meta.dirname, '..');
const pnpmCommand = 'pnpm.cmd';
const vendorDir = 'vendor/deepseek-harness';
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const temporaryRoot = resolve(tmpdir());
const outputDir = mkdtempSync(join(temporaryRoot, `freecode-release-gate-${version}-`));

// The vendored DSH workspace pins its own pnpm (root and vendor pins differ).
// Its steps run through corepack with that exact pin, so a machine without it
// fails closed here instead of running the vendor under the root's pnpm.
function vendorPnpmSpec() {
  const manager = JSON.parse(readFileSync(resolve(root, vendorDir, 'package.json'), 'utf8')).packageManager;
  const match = /^pnpm@(\d+\.\d+\.\d+)$/.exec(manager ?? '');
  if (match === null) throw new Error(`release-gate: ${vendorDir} packageManager must pin an exact pnpm version`);
  return `pnpm@${match[1]}`;
}

function run(label, args, env = {}) {
  console.log(`\nrelease-gate: ${label}`);
  const vendorStep = args[0] === '--dir' && args[1] === vendorDir;
  const command = vendorStep ? 'corepack' : pnpmCommand;
  const commandArgs = vendorStep ? [vendorPnpmSpec(), ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    shell: true,
    env: { ...process.env, CI: 'true', ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status)}`);
}

function runGit(label, args) {
  console.log(`\nrelease-gate: ${label}`);
  const result = spawnSync('git.exe', args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status)}`);
}

function runElectronAsNode(label, args, env = {}) {
  console.log(`\nrelease-gate: ${label}`);
  const electronPath = resolve(root, 'apps/shell/node_modules/electron/dist/electron.exe');
  const result = spawnSync(electronPath, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, CI: 'true', ELECTRON_RUN_AS_NODE: '1', ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status)}`);
}

console.log(`release-gate: verifying local desktop candidate ${version}; DSH runtime remains separately pinned.`);
try {
  const plan = createReleaseGatePlan({ version, outputDir });
  for (const step of plan) {
    if (step.tool === 'git') runGit(step.label, step.args);
    else if (step.tool === 'electron-as-node') runElectronAsNode(step.label, step.args, step.env);
    else run(step.label, step.args, step.env);
  }
  console.log(`\nrelease-gate: ${version} non-interactive desktop release checks passed; only hidden test-owned CLI/fixture children ran; no installer or FreeCode GUI was launched.`);
} finally {
  const relative = resolve(outputDir);
  const tempPrefix = temporaryRoot.endsWith(sep) ? temporaryRoot : `${temporaryRoot}${sep}`;
  if (!relative.startsWith(tempPrefix)) {
    throw new Error(`release-gate: refusing to clean output outside OS temp: ${relative}`);
  }
  rmSync(relative, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
