#!/usr/bin/env node
/**
 * NSIS hook lint — refuses destructive runtime cleanup in unsupported or
 * post-extraction hooks and verifies that the build hook owns upgrade cleanup.
 *
 * The v0.2.4 install crash traced back to a `customInstall` macro that ran
 * `RMDir /r` on `apps/`, `packages/`, and `node_modules/`. The author
 * assumed `customInstall` runs BEFORE the install section extracts files;
 * electron-builder's `installSection.nsh` invokes it AFTER
 * `installApplicationFiles`, so the RMDir deleted the payload that had
 * just been extracted, leaving the shipped dsh runtime incomplete.
 *
 * electron-builder 25.1.8 has no `customInit` hook. The beforePack hook
 * patches installSection.nsh to call `freecodePrepareInstall` before payload
 * extraction; this gate refuses configurations that silently rely on an
 * unsupported hook or delete the fresh payload from `customInstall`.
 *
 * Exit codes:
 *   0 — installer.nsh is clean.
 *   1 — a mutation is declared inside a post-extraction hook.
 *   2 — installer.nsh not found (misconfiguration).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER_NSH = resolve(REPO_ROOT, 'apps/shell/build/installer.nsh');

if (!existsSync(INSTALLER_NSH)) {
  console.error(`verify-nsis-hooks: installer.nsh not found at ${INSTALLER_NSH}`);
  process.exit(2);
}

const source = readFileSync(INSTALLER_NSH, 'utf8');

// Keep the file syntactically balanced before electron-builder invokes makensis.
// A stray !macroend otherwise survives the hook scan and fails only at the
// final packaging step, after the expensive runtime build has completed.
const macroStack = [];
for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
  const line = rawLine.replace(/;.*$/, '').trim();
  if (/^!macro\s+\w+/i.test(line)) {
    macroStack.push(index + 1);
  } else if (/^!macroend\b/i.test(line)) {
    if (macroStack.length === 0) {
      console.error(`verify-nsis-hooks: unmatched !macroend at line ${index + 1}.`);
      process.exit(1);
    }
    macroStack.pop();
  }
}
if (macroStack.length > 0) {
  console.error(`verify-nsis-hooks: ${macroStack.length} NSIS macro(s) are not closed.`);
  process.exit(1);
}

if (/!macro\s+customInit\b/i.test(source)) {
  console.error('verify-nsis-hooks: customInit is not a supported electron-builder 25.1.8 hook.');
  process.exit(1);
}

if (!source.includes('!macro freecodePrepareInstall') || !source.includes('RMDir /r "$INSTDIR\\resources\\freecode"')) {
  console.error('verify-nsis-hooks: deterministic pre-extraction FreeCode cleanup is missing.');
  process.exit(1);
}

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
  console.error('Move cleanup logic into the patched pre-extraction install section.');
  console.error('');
  for (const p of problems) {
    console.error(`  !macro ${p.macro} — line ${p.line}: ${p.command}`);
    console.error(`    ${p.content}`);
  }
  process.exit(1);
}

console.log('verify-nsis-hooks: clean.');
