#!/usr/bin/env node
/**
 * Required local release gate for the Windows desktop artifact.
 *
 * Every installed-app exercise is isolated in the smoke scripts' temporary
 * directories. This gate never targets an existing user installation.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.platform !== 'win32') {
  console.error('release-gate: Windows desktop release verification requires Windows; refusing to report green.');
  process.exit(2);
}

const root = resolve(import.meta.dirname, '..');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = (label, args) => {
  console.log(`\nrelease-gate: ${label}`);
  const result = spawnSync(pnpmCommand, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
    env: { ...process.env, CI: 'true' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status)}`);
};

const runGit = (label, args) => {
  console.log(`\nrelease-gate: ${label}`);
  const result = spawnSync('git.exe', args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status)}`);
};

const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
console.log(`release-gate: verifying local candidate ${version}`);

runGit('whitespace validation', ['diff', '--check']);
run('all workspace tests', ['test']);
run('all workspace contract tests', ['test:contract']);
run('all workspace typechecks', ['typecheck']);
run('Windows ACL regression tests', [
  '--dir', 'vendor/deepseek-harness', 'exec', 'vitest', 'run',
  'packages/sandbox/sandbox-windows-acl/tests/failure-paths.spec.ts',
  'packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts',
]);
run('desktop build and runtime packaging', ['build:desktop']);
run('all vendored bundle freshness', ['exec', 'node', 'scripts/verify-vendor-bundles-fresh.mjs']);
run('compiled conversation motion bundle', ['exec', 'node', 'scripts/verify-conversation-bundle.mjs', 'vendor/deepseek-harness']);
run('runtime closure unit tests', ['exec', 'node', '--test', 'scripts/runtime-closure.test.mjs']);
run('core runtime closure (no optional Claude/Codex payloads)', ['exec', 'node', 'scripts/verify-runtime-closure.mjs', 'apps/shell/resources/freecode/dsh']);
run('fresh NSIS install and installed-runtime smoke', ['--filter', '@freecode/shell', 'smoke:nsis']);
run('0.2.4 to candidate upgrade and installed-runtime smoke', ['--filter', '@freecode/shell', 'smoke:nsis:upgrade']);

console.log(`\nrelease-gate: ${version} local candidate passed every required gate.`);
