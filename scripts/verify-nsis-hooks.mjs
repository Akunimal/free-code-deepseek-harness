#!/usr/bin/env node
/**
 * NSIS hook lint — refuses `RMDir` or `Delete` inside `customInstall`.
 *
 * The v0.2.4 install crash traced back to a `customInstall` macro that ran
 * `RMDir /r` on `apps/`, `packages/`, and `node_modules/`. The author
 * assumed `customInstall` runs BEFORE the install section extracts files;
 * electron-builder's `installSection.nsh` invokes it AFTER
 * `installApplicationFiles`, so the RMDir deleted the payload that had
 * just been extracted, leaving the shipped dsh runtime incomplete.
 *
 * Pre-extraction cleanup MUST use `customInit` (fires in `.onInit`) or
 * `customRemoveFiles` (fires during `uninstallOldVersion`). This gate
 * refuses to merge changes that reintroduce the same bug.
 *
 * Exit codes:
 *   0 — installer.nsh is clean.
 *   1 — a mutation is declared inside a post-extraction hook.
 *   2 — installer.nsh not found (misconfiguration).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const INSTALLER_NSH = resolve(process.cwd(), 'apps/shell/build/installer.nsh');

if (!existsSync(INSTALLER_NSH)) {
  console.error(`verify-nsis-hooks: installer.nsh not found at ${INSTALLER_NSH}`);
  process.exit(2);
}

const source = readFileSync(INSTALLER_NSH, 'utf8');

const POST_EXTRACTION_HOOKS = new Set(['customInstall']);
const MUTATION_COMMANDS = /(?:^|\s)(RMDir|Delete|Rename|CopyFiles|WriteRegStr|WriteRegDWORD|DeleteRegKey|DeleteRegValue)\b/i;

const problems = [];

const macroPattern = /!macro\s+(\w+)([\s\S]*?)!macroend/g;
let match;
while ((match = macroPattern.exec(source)) !== null) {
  const name = match[1];
  const body = match[2];
  if (!POST_EXTRACTION_HOOKS.has(name)) continue;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/;.*$/, '').trim();
    if (line === '') continue;
    const m = line.match(MUTATION_COMMANDS);
    if (m) {
      problems.push({
        macro: name,
        command: m[1],
        line: i + 1,
        content: line,
      });
    }
  }
}

if (problems.length > 0) {
  console.error('verify-nsis-hooks: filesystem mutations found in POST-EXTRACTION hooks.');
  console.error('These hooks run AFTER installApplicationFiles extracts the payload;');
  console.error('a RMDir / Delete here will silently wipe the fresh install.');
  console.error('Move cleanup logic into `customInit` (fires in .onInit before extraction)');
  console.error('or `customRemoveFiles` (fires during uninstallOldVersion).');
  console.error('');
  for (const p of problems) {
    console.error(`  !macro ${p.macro} — line ${p.line}: ${p.command}`);
    console.error(`    ${p.content}`);
  }
  process.exit(1);
}

console.log('verify-nsis-hooks: clean.');
