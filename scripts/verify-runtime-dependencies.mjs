#!/usr/bin/env node
/**
 * verify-runtime-dependencies.mjs — Phase 2 validation script.
 *
 * Verifies that every declared runtime dependency is present in the staged
 * payload, with correct SHA-256 hashes and no external network requirements
 * for required dependencies.
 *
 * Usage:
 *   node scripts/verify-runtime-dependencies.mjs --path <staged-runtime>
 *   node scripts/verify-runtime-dependencies.mjs              # uses repo default
 *
 * Exit code 0 = all checks pass. Non-zero = failure with diagnostic.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingRuntimeDependencyIsFailure } from './runtime-dependency-policy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── CLI args ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const pathIdx = args.indexOf('--path');
const STAGED_RUNTIME = pathIdx !== -1
  ? resolve(args[pathIdx + 1])
  : resolve(REPO_ROOT, 'apps/shell/resources/freecode');

// ── Load manifest ───────────────────────────────────────────────────
const manifestPath = resolve(REPO_ROOT, 'apps/shell/resources/runtime-deps.json');
if (!existsSync(manifestPath)) {
  console.error(`runtime-deps.json not found at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.version !== '1') {
  console.error(`Unexpected manifest version: ${manifest.version}`);
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────
function sha256(filePath) {
  const data = readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

const checks = [];

function logCheck(name, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  const detailStr = detail ? ` (${detail})` : '';
  console.log(`  [${status}] ${name}${detailStr}`);
  checks.push({ name, pass });
}

// ── Checks ──────────────────────────────────────────────────────────

// 1. Manifest file exists and is valid JSON
checks.push({
  name: 'manifest-valid',
  pass: manifest !== null && typeof manifest === 'object',
});
logCheck('manifest-valid', true, `schema version ${manifest.version}`);

// 2. Payload directory exists
const payloadExists = existsSync(STAGED_RUNTIME);
logCheck('payload-dir-exists', payloadExists, relative(REPO_ROOT, STAGED_RUNTIME));

if (!payloadExists) {
  console.log('\n  "result": "FAIL" — payload dir missing');
  process.exit(1);
}

// 3. Check each dependency
const requiredMissing = [];
const networkRequired = [];
const hashMismatches = [];
const pathMisses = [];

for (const dep of manifest.dependencies) {
  const depPath = join(STAGED_RUNTIME, dep.path);

  // 3a. Path check
  if (dep.path === 'PLACEHOLDER' || dep.path === 'N/A') {
    pathMisses.push(dep.id)
    logCheck(`${dep.id}: path`, dep.path === 'N/A', dep.path === 'N/A' ? 'N/A — optional, not bundled' : 'PLACEHOLDER — not yet resolved')
    continue
  }

  if (!existsSync(depPath)) {
    const failure = missingRuntimeDependencyIsFailure(dep);
    if (failure) requiredMissing.push(dep.id);
    logCheck(
      `${dep.id}: exists`,
      !failure,
      failure ? depPath : 'optional — not bundled; may resolve from PATH',
    );
    continue;
  }

  logCheck(`${dep.id}: exists`, true, dep.path);

  // 3b. Hash check (skip if PLACEHOLDER)
  if (dep.sha256 !== 'PLACEHOLDER') {
    const actual = sha256(depPath);
    const match = actual === dep.sha256;
    if (!match) hashMismatches.push({ id: dep.id, expected: dep.sha256, actual });
    logCheck(`${dep.id}: sha256`, match, match ? actual.slice(0, 16) + '…' : `expected ${dep.sha256.slice(0, 16)}… got ${actual.slice(0, 16)}…`);
  } else {
    logCheck(`${dep.id}: sha256`, true, 'PLACEHOLDER — hash not yet computed');
  }

  // 3c. Network check for required dependencies
  if (dep.required && dep.network) {
    networkRequired.push(dep.id);
    logCheck(`${dep.id}: network-allowed`, false, 'required dep must not need network');
  } else if (dep.network) {
    logCheck(`${dep.id}: network-allowed`, true, 'optional dep, network flagged');
  } else {
    logCheck(`${dep.id}: no-network`, true, 'offline-safe');
  }
}

// 4. No git+https:// or pip install in config files (quick scan)
const configFiles = [
  join(STAGED_RUNTIME, 'dsh', 'settings.json'),
  join(STAGED_RUNTIME, 'dsh', '.claude', 'mcp_servers.json'),
  join(STAGED_RUNTIME, 'dsh', 'mcp', 'servers.json'),
];
let hasGitDownload = false;
let hasPipInstall = false;
for (const f of configFiles) {
  const content = (() => { try { return readFileSync(f, 'utf8'); } catch { return ''; }})();
  if (content.includes('git+https://')) hasGitDownload = true;
  if (content.includes('pip install')) hasPipInstall = true;
}
logCheck('no-git-download-in-config', !hasGitDownload, hasGitDownload ? 'FOUND git+https:// references' : 'clean (or no config yet)');
logCheck('no-pip-install-in-config', !hasPipInstall, hasPipInstall ? 'FOUND pip install references' : 'clean');

// 5. Summary
console.log();
const allPass = checks.every(c => c.pass) && requiredMissing.length === 0 && networkRequired.length === 0 && hashMismatches.length === 0;
const total = checks.length;
const passed = checks.filter(c => c.pass).length;
console.log(`verify-runtime-dependencies: ${passed}/${total} checks passed`);

if (requiredMissing.length > 0) {
  console.error(`  REQUIRED MISSING: ${requiredMissing.join(', ')}`);
}
if (networkRequired.length > 0) {
  console.error(`  NETWORK-REQUIRED: ${networkRequired.join(', ')}`);
}
if (hashMismatches.length > 0) {
  console.error(`  HASH MISMATCHES: ${hashMismatches.map(h => `${h.id} (expected ${h.expected.slice(0,12)}… got ${h.actual.slice(0,12)}…)`).join(', ')}`);
}
if (pathMisses.length > 0) {
  const na = pathMisses.filter(id => manifest.dependencies.find(d => d.id === id)?.path === 'N/A')
  const ph = pathMisses.filter(id => manifest.dependencies.find(d => d.id === id)?.path === 'PLACEHOLDER')
  if (na.length > 0) console.error(`  OPTIONAL (N/A): ${na.join(', ')} — not bundled, PATH-only`)
  if (ph.length > 0) console.error(`  PLACEHOLDER PATHS: ${ph.join(', ')} — resolve before lock`)
}

console.log(`\n  "result": "${allPass ? 'PASS' : 'FAIL'}"`);
process.exit(allPass ? 0 : 1);
