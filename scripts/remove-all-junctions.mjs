#!/usr/bin/env node
/**
 * remove-all-junctions.mjs — Remove ALL Windows junctions (reparse points)
 * from a directory tree. Junctions in pnpm node_modules/ form cycles that
 * break 7za.exe and cpSync with dereference. Removing them is safe because
 * Node.js resolution walks up to the root node_modules/ which has all
 * materialized dependencies.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node remove-all-junctions.mjs <directory>');
  process.exit(1);
}

let output;
try {
  output = execSync(
    `powershell -NoProfile -Command "Get-ChildItem -Path '${dir}' -Recurse -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Attributes -match 'ReparsePoint' } | Select-Object -ExpandProperty FullName"`,
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 100 * 1024 * 1024 }
  );
} catch {
  console.log('remove-all-junctions: no junctions found');
  process.exit(0);
}

const junctions = output.split(/\r?\n/).filter(line => line.trim().length > 0);
console.log(`remove-all-junctions: found ${junctions.length} junctions`);

let removed = 0;
for (const j of junctions) {
  const trimmed = j.trim();
  if (!trimmed) continue;
  try {
    fs.rmSync(trimmed, { recursive: true, force: true });
    removed++;
  } catch {
    try {
      execSync(`rmdir "${trimmed}"`, { timeout: 5_000, stdio: 'ignore' });
      removed++;
    } catch {}
  }
}

console.log(`remove-all-junctions: removed ${removed} junctions`);