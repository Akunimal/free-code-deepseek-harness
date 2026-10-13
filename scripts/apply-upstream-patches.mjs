import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

function runGit(args, opts = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...opts,
  });
}

function die(msg) {
  console.error(`\x1b[31mapply-upstream-patches: FATAL\x1b[0m ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Load and validate manifest
// ---------------------------------------------------------------------------

if (!existsSync(manifestPath)) die(`missing manifest: ${relative(root, manifestPath)}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (!manifest.vendorPrefix) die('manifest missing vendorPrefix');
if (!Array.isArray(manifest.patches) || manifest.patches.length === 0) die('manifest has no patches');
const vendorPrefix = manifest.vendorPrefix;

// Build ordered patch list from manifest
const manifestPatches = manifest.patches
  .slice()
  .sort((a, b) => a.order - b.order);

// Collect actual .patch files on disk
if (!existsSync(patchDir)) die(`missing patch directory: ${relative(root, patchDir)}`);
const diskPatchFiles = readdirSync(patchDir)
  .filter(name => name.endsWith('.patch'))
  .sort();

// ---------------------------------------------------------------------------
// 2. Reject unknown patches (file exists but not in manifest)
// ---------------------------------------------------------------------------

const manifestFiles = new Set(manifestPatches.map(p => p.file));
const unknownFiles = diskPatchFiles.filter(f => !manifestFiles.has(f));
if (unknownFiles.length > 0) {
  die(
    `unknown patch files not declared in manifest:\n` +
    unknownFiles.map(f => `  - ${f}`).join('\n') +
    `\nAdd them to upstream-patches.json or remove them.`
  );
}

// ---------------------------------------------------------------------------
// 3. Reject missing patches (manifest declares but file absent)
// ---------------------------------------------------------------------------

const diskFiles = new Set(diskPatchFiles);
const missingFiles = manifestPatches.filter(p => !diskFiles.has(p.file));
if (missingFiles.length > 0) {
  die(
    `manifest declares patches missing from disk:\n` +
    missingFiles.map(p => `  - ${p.file} (order ${p.order})`).join('\n')
  );
}

// ---------------------------------------------------------------------------
// 4. Validate patch order (monotonic, no gaps beyond allowed)
// ---------------------------------------------------------------------------

for (let i = 1; i < manifestPatches.length; i++) {
  if (manifestPatches[i].order <= manifestPatches[i - 1].order) {
    die(
      `patch order not monotonic: ${manifestPatches[i - 1].file} (${manifestPatches[i - 1].order}) ` +
      `>= ${manifestPatches[i].file} (${manifestPatches[i].order})`
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Validate vendor-only constraint for every patch
// ---------------------------------------------------------------------------

function assertVendorOnly(patchPath) {
  const contents = readFileSync(patchPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+?)(?:\t.*)?$/);
    if (match === null || match[1] === '/dev/null') continue;
    if (!match[1].startsWith(vendorPrefix)) {
      die(
        `patch escapes vendor prefix: ${relative(root, patchPath)} -> ${match[1]}\n` +
        `Expected all paths under ${vendorPrefix}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Optional: stale upstream commit check
// ---------------------------------------------------------------------------

if (manifest.upstream?.syncCommit) {
  // Check if the subtree was synced to the declared commit
  const lastSync = runGit([
    'log', '--oneline', '--all', '--grep', `sync ${vendorPrefix}`,
    '-1', '--format=%H %s'
  ]);
  if (lastSync.status === 0 && lastSync.stdout.trim()) {
    const declaredCommit = manifest.upstream.syncCommit;
    const logLine = lastSync.stdout.trim();
    if (!logLine.includes(declaredCommit.slice(0, 7))) {
      console.warn(
        `apply-upstream-patches: WARNING — manifest declares syncCommit ${declaredCommit} ` +
        `but last sync commit is: ${logLine}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Apply patches in declared order
// ---------------------------------------------------------------------------

const patchedPaths = new Set();
let applied = 0;
let alreadyApplied = 0;

const overlapping = verifyOverlappingAppliedPatches({
  root,
  patchDir,
  patches: manifestPatches,
  vendorPrefix,
});
if (!overlapping.ok) {
  die(`overlapping patch stack cannot be replayed: ${overlapping.patch ?? 'unknown patch'}\n${overlapping.detail ?? 'unknown replay failure'}`);
}
const stackedAlreadyApplied = new Set(overlapping.alreadyApplied);

for (const entry of manifestPatches) {
  const patchPath = join(patchDir, entry.file);
  if (!existsSync(patchPath)) die(`patch file missing: ${entry.file}`);
  assertVendorOnly(patchPath);

  const contents = readFileSync(patchPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+?)(?:\t.*)?$/);
    if (match !== null && match[1] !== '/dev/null') patchedPaths.add(match[1]);
  }

  const display = relative(root, patchPath);
  if (stackedAlreadyApplied.has(entry.file)) {
    console.log(`apply-upstream-patches: already applied ${display} [order ${entry.order}, stacked replay]`);
    alreadyApplied++;
    continue;
  }

  // Try forward apply
  const check = runGit(['apply', '--check', '--whitespace=nowarn', patchPath]);
  if (check.status === 0) {
    const apply = runGit(['apply', '--whitespace=nowarn', patchPath]);
    if (apply.status !== 0) {
      die(`failed to apply ${display}:\n${apply.stderr || apply.stdout}`);
    }
    console.log(`apply-upstream-patches: applied ${display} [order ${entry.order}]`);
    applied++;
    continue;
  }

  // Check if already applied (reverse applies cleanly)
  const reverse = runGit(['apply', '--check', '--reverse', '--whitespace=nowarn', patchPath]);
  if (reverse.status === 0) {
    console.log(`apply-upstream-patches: already applied ${display} [order ${entry.order}]`);
    alreadyApplied++;
    continue;
  }

  die(
    `upstream patch does not apply cleanly: ${display}\n` +
    `${check.stderr || check.stdout}\n` +
    'Refresh the patch against the new upstream snapshot before building.'
  );
}

// ---------------------------------------------------------------------------
// 8. Whitespace check on patched paths
// ---------------------------------------------------------------------------

const whitespace = runGit(['diff', '--check', '--', ...patchedPaths]);
if (whitespace.status !== 0) {
  die(`patched upstream tree has whitespace errors:\n${whitespace.stdout || whitespace.stderr}`);
}

// ---------------------------------------------------------------------------
// 9. Summary
// ---------------------------------------------------------------------------

console.log(
  `\napply-upstream-patches: ${manifestPatches.length} patches declared, ` +
  `${applied} applied, ${alreadyApplied} already applied, 0 failed`
);
console.log(`apply-upstream-patches: vendor prefix ${vendorPrefix}, ${patchedPaths.size} paths touched`);

if (manifest.upstream?.version) {
  console.log(`apply-upstream-patches: upstream version ${manifest.upstream.version}`);
}
