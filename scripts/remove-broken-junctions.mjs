#!/usr/bin/env node
/**
 * remove-broken-junctions.mjs — Walk node_modules/ and remove any
 * directory junction whose target does not exist. This prevents
 * 7za.exe (NSIS) from failing with "path not found" warnings.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node remove-broken-junctions.mjs <directory>');
  process.exit(1);
}

// Use PowerShell to find all reparse points (junctions) efficiently
let output;
try {
  output = execSync(
    `powershell -NoProfile -Command "Get-ChildItem -Path '${dir}' -Recurse -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Attributes -match 'ReparsePoint' } | Select-Object -ExpandProperty FullName"`,
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 50 * 1024 * 1024 }
  );
} catch {
  console.log('remove-broken-junctions: no reparse points found or PowerShell error');
  process.exit(0);
}

const junctions = output.split(/\r?\n/).filter(line => line.trim().length > 0);
console.log(`remove-broken-junctions: found ${junctions.length} junctions`);

let removed = 0;
let kept = 0;

for (const junction of junctions) {
  const trimmed = junction.trim();
  if (!trimmed) continue;

  // Check if the junction target exists
  try {
    const stat = fs.statSync(trimmed); // follows junction
    if (stat.isDirectory() || stat.isFile()) {
      kept++;
      continue;
    }
  } catch {
    // Target doesn't exist
  }

  // Remove broken junction
  try {
    fs.rmSync(trimmed, { recursive: true, force: true });
    removed++;
  } catch (err) {
    // Try alternative removal
    try {
      execSync(`rmdir "${trimmed}"`, { timeout: 5_000 });
      removed++;
    } catch {}
  }
}

console.log(`remove-broken-junctions: removed=${removed} kept=${kept}`);