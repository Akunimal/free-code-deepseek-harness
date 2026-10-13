#!/usr/bin/env node
/**
 * verify-upstream-patch-stack.mjs
 *
 * Phase 1 verification script. Emits a machine-readable report for the
 * upstream patch stack. Run from the repository root:
 *
 *   node scripts/verify-upstream-patch-stack.mjs
 *
 * Exit code 0 = all checks pass. Non-zero = failure with diagnostic.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyOverlappingAppliedPatches } from './patch-stack-replay.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const patchDir = join(root, 'patches', 'upstream');
const manifestPath = join(patchDir, 'upstream-patches.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runGit(args) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function sha256File(p) {
  const data = readFileSync(p);
  return createHash('sha256').update(data).digest('hex');
}

function die(msg) {
  console.error(`\x1b[31mverify-upstream-patch-stack: FAIL\x1b[0m ${msg}`);
  process.exit(1);
}

const report = {
  timestamp: new Date().toISOString(),
  upstream: {},
  patches: [],
  checks: {
    manifestValid: false,
    orderMonotonic: false,
    vendorOnly: false,
    noUnknownFiles: false,
    noMissingFiles: false,
    idempotent: false,
    replayClean: false,
    whitespaceClean: false,
  },
  diffSummary: { filesChanged: 0, insertions: 0, deletions: 0 },
  result: 'FAIL',
};

// ---------------------------------------------------------------------------
// 1. Load manifest
// ---------------------------------------------------------------------------

if (!existsSync(manifestPath)) die('missing manifest');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.upstream) {
  report.upstream = {
    remote: manifest.upstream.remote || 'unknown',
    ref: manifest.upstream.ref || 'unknown',
    version: manifest.upstream.version || 'unknown',
    syncCommit: manifest.upstream.syncCommit || 'unknown',
  };
}

if (!manifest.vendorPrefix || !Array.isArray(manifest.patches) || manifest.patches.length === 0) {
  die('invalid manifest structure');
}

const vendorPrefix = manifest.vendorPrefix;
const manifestPatches = manifest.patches.slice().sort((a, b) => a.order - b.order);

// ---------------------------------------------------------------------------
// 2. Validate manifest completeness
// ---------------------------------------------------------------------------

const diskFiles = readdirSync(patchDir).filter(f => f.endsWith('.patch')).sort();
const manifestFileSet = new Set(manifestPatches.map(p => p.file));
const diskFileSet = new Set(diskFiles);

const unknown = diskFiles.filter(f => !manifestFileSet.has(f));
const missing = manifestPatches.filter(p => !diskFileSet.has(p.file));

report.checks.noUnknownFiles = unknown.length === 0;
report.checks.noMissingFiles = missing.length === 0;

if (unknown.length > 0) {
  console.error(`Unknown patch files: ${unknown.join(', ')}`);
}
if (missing.length > 0) {
  console.error(`Missing patch files: ${missing.map(p => p.file).join(', ')}`);
}

// ---------------------------------------------------------------------------
// 3. Validate order monotonicity
// ---------------------------------------------------------------------------

let orderOk = true;
for (let i = 1; i < manifestPatches.length; i++) {
  if (manifestPatches[i].order <= manifestPatches[i - 1].order) {
    orderOk = false;
    console.error(
      `Order violation: ${manifestPatches[i - 1].file} (${manifestPatches[i - 1].order}) ` +
      `>= ${manifestPatches[i].file} (${manifestPatches[i].order})`
    );
  }
}
report.checks.orderMonotonic = orderOk;

// ---------------------------------------------------------------------------
// 4. Validate vendor-only for every patch
// ---------------------------------------------------------------------------

let vendorOnlyOk = true;
const allTouchedPaths = new Set();

for (const entry of manifestPatches) {
  const patchPath = join(patchDir, entry.file);
  if (!existsSync(patchPath)) continue;

  const contents = readFileSync(patchPath, 'utf8');
  const sha = sha256File(patchPath);
  const touchedPaths = [];

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+?)(?:\t.*)?$/);
    if (match === null || match[1] === '/dev/null') continue;
    touchedPaths.push(match[1]);
    allTouchedPaths.add(match[1]);
    if (!match[1].startsWith(vendorPrefix)) {
      vendorOnlyOk = false;
      console.error(`Patch ${entry.file} escapes vendor prefix: ${match[1]}`);
    }
  }

  report.patches.push({
    file: entry.file,
    order: entry.order,
    owner: entry.owner,
    description: entry.description,
    sha256: sha,
    touchedPaths,
  });
}

report.checks.vendorOnly = vendorOnlyOk;

// ---------------------------------------------------------------------------
// 5. Validate manifest is complete (all fields present)
// ---------------------------------------------------------------------------

let manifestValid = true;
for (const entry of manifestPatches) {
  for (const field of ['file', 'order', 'owner', 'description', 'seam', 'vendorOnly']) {
    if (entry[field] === undefined || entry[field] === null) {
      manifestValid = false;
      console.error(`Patch ${entry.file} missing required field: ${field}`);
    }
  }
}
report.checks.manifestValid = manifestValid;

// ---------------------------------------------------------------------------
// 6. Idempotency check
// ---------------------------------------------------------------------------

// Apply the stack: if all are already applied, it's idempotent.
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const spawnOpts = { cwd: root, encoding: 'utf8', windowsHide: true, shell: true };

const apply1 = spawnSync(pnpm, ['apply:upstream-patches'], spawnOpts);

// Run again to verify idempotency
const apply2 = spawnSync(pnpm, ['apply:upstream-patches'], spawnOpts);

// Both must succeed. Second run should show "already applied" for all.
const out1 = apply1.stdout || '';
const out2 = apply2.stdout || '';
report.checks.idempotent = apply1.status === 0 && apply2.status === 0;

if (!report.checks.idempotent) {
  console.error(`Idempotency check failed:\n  Run 1: exit ${apply1.status}\n  Run 2: exit ${apply2.status}`);
}

// ---------------------------------------------------------------------------
// 7. Whitespace check
// ---------------------------------------------------------------------------

const patchedPaths = [...allTouchedPaths];
const ws = runGit(['diff', '--check', '--', ...patchedPaths]);
report.checks.whitespaceClean = ws.status === 0;

if (ws.status !== 0) {
  console.error(`Whitespace errors:\n${ws.stdout || ws.stderr}`);
}

// ---------------------------------------------------------------------------
// 7b. Replay check — individual patches plus ordered replay for overlaps
// ---------------------------------------------------------------------------

let replayOk = false;
if (!manifestPatches.some((entry) => !existsSync(join(patchDir, entry.file)))) {
  const replay = verifyOverlappingAppliedPatches({ root, patchDir, patches: manifestPatches, vendorPrefix });
  replayOk = replay.ok;
  if (!replay.ok) {
    console.error(`Replay check failed for ${replay.patch ?? 'overlapping patch group'}: ${replay.detail ?? 'neither forward nor reverse stack replay applies'}`);
  }
}
report.checks.replayClean = replayOk;

// ---------------------------------------------------------------------------
// 8. Diff summary (non-secret)
// ---------------------------------------------------------------------------

const diffStat = runGit(['diff', '--stat', '--', ...patchedPaths]);
if (diffStat.status === 0 && diffStat.stdout.trim()) {
  const lastLine = diffStat.stdout.trim().split('\n').pop();
  const m = lastLine.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
  if (m) {
    report.diffSummary = {
      filesChanged: parseInt(m[1], 10),
      insertions: m[2] ? parseInt(m[2], 10) : 0,
      deletions: m[3] ? parseInt(m[3], 10) : 0,
    };
  }
}

// ---------------------------------------------------------------------------
// 9. Overall result
// ---------------------------------------------------------------------------

const allPass = Object.values(report.checks).every(Boolean);
report.result = allPass ? 'PASS' : 'FAIL';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

console.log(JSON.stringify(report, null, 2));

if (!allPass) {
  const failed = Object.entries(report.checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  console.error(`\nFailed checks: ${failed.join(', ')}`);
  process.exit(1);
}

console.log(`\nverify-upstream-patch-stack: ALL CHECKS PASSED`);
process.exit(0);
