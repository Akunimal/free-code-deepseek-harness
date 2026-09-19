#!/usr/bin/env node
/**
 * Copy the already-verified runtime stage into desktop resources.
 *
 * The hoisted install leaves a pnpm virtual store under node_modules/.pnpm.
 * Runtime resolution uses the materialized package directories at the root,
 * so shipping that store only increases copy time and payload surface. Keep
 * this copy fail-closed: callers must remove the exact generated destination
 * before invoking it.
 */
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve(process.argv[2] ?? '');
const destination = path.resolve(process.argv[3] ?? '');
if (!source || !destination || !fs.existsSync(path.join(source, 'package.json'))) {
  throw new Error(`copy-runtime-stage: invalid source stage: ${source}`);
}
if (fs.existsSync(destination)) {
  throw new Error(`copy-runtime-stage: destination already exists; remove only the generated destination first: ${destination}`);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
// Copy the stage WITHOUT the .pnpm virtual store. pnpm's hoisted symlinks
// resolve through .pnpm but 7za.exe (NSIS) cannot follow them during
// packaging. Instead, we materialize workspace packages and resolve broken
// symlinks in a post-copy step.
const PNM_EXCLUDE = new Set(['.pnpm', '.modules.yaml']);
// NOTE: dereference is intentionally NOT used here. pnpm junctions form
// cycles (cordis -> cordis-plugin-include -> cordis -> ...) which cause
// ELOOP with dereference. Junctions are resolved in a post-copy step.
fs.cpSync(source, destination, {
  recursive: true,
  filter(candidate) {
    const relative = path.relative(source, candidate);
    if (relative === '') return true;
    const parts = relative.split(path.sep);
    return !(parts[0] === 'node_modules' && PNM_EXCLUDE.has(parts[1]));
  },
});

// Materialize workspace packages into node_modules/@deepseek-ai/.
// The hoisted install may leave these as pnpm links that break Electron's
// ESM resolution. Copying them as real directories ensures the preflight
// check finds dsh-host-directory-picker-native and every other workspace
// package at the expected node_modules path.
const rootModules = path.join(destination, 'node_modules');
const materialized = [];
function walkPackages(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPackages(full);
    else if (entry.name === 'package.json') {
      try {
        const manifest = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (typeof manifest.name === 'string' && manifest.name.startsWith('@deepseek-ai/')) {
          materialized.push({ dir: path.dirname(full), name: manifest.name });
        }
      } catch { /* non-package JSON */ }
    }
  }
}
for (const sub of ['apps', 'packages', 'native', 'vendor']) {
  walkPackages(path.join(destination, sub));
}
for (const { dir: pkgDir, name } of materialized) {
  const [scope, pkgName] = name.split('/');
  const dest = path.join(rootModules, scope, pkgName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(pkgDir, dest, {
    recursive: true,
    filter(source) {
      const rel = path.relative(pkgDir, source);
      return rel === '' || !rel.split(path.sep).includes('node_modules');
    },
  });
}
console.log(`copy-runtime-stage: copied verified stage to ${destination} without node_modules/.pnpm; materialized ${materialized.length} workspace packages`);

// Post-copy: resolve broken symlinks in node_modules/ that pointed to .pnpm/.
// These are non-workspace dependencies (sharp, koffi, @opentelemetry, etc.)
// that pnpm hoists via symlinks. Without .pnpm, the symlinks are broken.
// We walk the destination's node_modules, find broken symlinks, and copy
// the actual package from the source's .pnpm store.
const sourcePnpm = path.join(source, 'node_modules', '.pnpm');
let resolved = 0;

function resolveBrokenLinks(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      // Recurse into real directories (but skip .pnpm itself)
      if (entry.name !== '.pnpm') resolveBrokenLinks(full);
      continue;
    }
    // Check if this is a broken symlink or junction
    let isLink = entry.isSymbolicLink();
    if (!isLink) {
      try { isLink = fs.lstatSync(full).isSymbolicLink(); } catch {}
    }
    if (!isLink) continue;
    // Check if target exists
    let target;
    try { target = fs.realpathSync(full); } catch { target = null; }
    if (target && fs.existsSync(target)) continue; // link is valid, skip
    // Broken link — try to find the package in the source .pnpm store
    const relativePath = path.relative(destination, full);
    const sourcePath = path.join(source, relativePath);
    if (fs.existsSync(sourcePath)) {
      // Remove broken link, copy from source
      try { fs.unlinkSync(full); } catch {}
      const stat = fs.statSync(sourcePath);
      if (stat.isDirectory()) {
        fs.cpSync(sourcePath, full, { recursive: true });
      } else {
        fs.copyFileSync(sourcePath, full);
      }
      resolved++;
    } else {
      // Can't resolve — remove broken link to prevent 7za errors
      try { fs.unlinkSync(full); } catch {}
    }
  }
}

resolveBrokenLinks(path.join(destination, 'node_modules'));
console.log(`copy-runtime-stage: resolved ${resolved} broken symlinks from .pnpm store`);

// Post-copy: remove all remaining junctions/reparse points. pnpm creates
// junctions on Windows that form cycles (cordis <-> cordis-plugin-include).
// 7za.exe (used by NSIS) cannot follow junctions and fails with "path not
// found". Node.js resolution still works because the root node_modules/
// has all materialized workspace packages, and nested node_modules/ are
// optional (pnpm hoists to root). Removing junctions in the packaged
// resources prevents 7za errors without affecting runtime resolution.
let junctionsRemoved = 0;
// Scan ALL node_modules/ directories in the tree, not just the root one.
// Junctions exist in apps/cli/node_modules/, packages/*/node_modules/, etc.
function removeJunctionsInDir(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    let isJunction = entry.isSymbolicLink();
    if (!isJunction && entry.isDirectory()) {
      try { isJunction = fs.lstatSync(full).isSymbolicLink(); } catch {}
    }
    if (isJunction) {
      fs.rmSync(full, { recursive: true, force: true });
      junctionsRemoved++;
    } else if (entry.isDirectory()) {
      removeJunctionsInDir(full);
    }
  }
}
// Start from every node_modules/ directory in the tree
const allNmDirs = [path.join(destination, 'node_modules')];
function findNmDirs(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === '.pnpm') continue;
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules') {
      allNmDirs.push(full);
    }
    findNmDirs(full);
  }
}
findNmDirs(destination);
for (const nmDir of allNmDirs) {
  removeJunctionsInDir(nmDir);
}
console.log(`copy-runtime-stage: removed ${junctionsRemoved} junctions for 7za compatibility`);
