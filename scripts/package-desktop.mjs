#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const shellRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/shell');
const repoRoot = resolve(shellRoot, '../..');
const version = JSON.parse(readFileSync(join(shellRoot, 'package.json'), 'utf8')).version;
const suppliedOutput = process.env.FREECODE_RELEASE_OUTPUT;
const outputPath = suppliedOutput
  ? resolve(shellRoot, suppliedOutput)
  : mkdtempSync(join(shellRoot, `release-${version}-local-`));
const sharedReleaseDir = resolve(shellRoot, 'release');
const protectedResourceDir = resolve(shellRoot, 'resources');

function atOrInside(target, parent) {
  const pathFromParent = relative(parent, target);
  return pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..' && !isAbsolute(pathFromParent));
}

if (outputPath === shellRoot || outputPath === repoRoot || atOrInside(outputPath, sharedReleaseDir) || atOrInside(outputPath, protectedResourceDir)) {
  throw new Error(`package-desktop: refusing unsafe or shared output path: ${outputPath}`);
}
if (existsSync(outputPath) && readdirSync(outputPath).length > 0 && process.env.FREECODE_ALLOW_REPLACE_RELEASE_OUTPUT !== '1') {
  throw new Error(`package-desktop: output directory is not empty; choose a fresh path or explicitly set FREECODE_ALLOW_REPLACE_RELEASE_OUTPUT=1: ${outputPath}`);
}
mkdirSync(outputPath, { recursive: true });

const targets = process.env.FREECODE_RELEASE_TARGETS ?? 'all';
if (!['all', 'nsis', 'portable'].includes(targets)) {
  throw new Error(`package-desktop: unsupported FREECODE_RELEASE_TARGETS=${targets}`);
}

const requireFromShell = createRequire(join(shellRoot, 'package.json'));
const electronBuilderEntrypoint = requireFromShell.resolve('electron-builder/cli.js');
const args = [electronBuilderEntrypoint, '--config', 'electron-builder.yml', '--publish', 'never'];
if (targets !== 'all') args.push('--win', targets);
args.push(`--config.directories.output=${outputPath}`);

console.log(`package-desktop: building ${version} (${targets}) into isolated output ${outputPath}`);
const result = spawnSync(process.execPath, args, {
  cwd: shellRoot,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`package-desktop: electron-builder exited with ${String(result.status)}`);
