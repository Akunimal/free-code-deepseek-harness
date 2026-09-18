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
fs.cpSync(source, destination, {
  recursive: true,
  filter(candidate) {
    const relative = path.relative(source, candidate);
    if (relative === '') return true;
    const parts = relative.split(path.sep);
    return !(parts[0] === 'node_modules' && (parts[1] === '.pnpm' || parts[1] === '.modules.yaml'));
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
