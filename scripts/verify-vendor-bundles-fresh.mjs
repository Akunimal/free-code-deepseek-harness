#!/usr/bin/env node
/**
 * Vendor bundle freshness gate — refuses to package when a shipped vendor
 * package has newer sources than its compiled bundle.
 *
 * The v0.2.4 install shipped a stale `lib/index.js` for
 * `dsh-host-directory-picker-native` because `src/native-picker.ts` was
 * edited to add the Electron dialog bridge, but `pnpm build:lib:host` in
 * the vendor was never re-run. `pnpm package` did not gate on this — it
 * just copied `lib/` verbatim into the packaged app. Result: the shipped
 * dsh runtime crashed on directory picker click because the bridge check
 * was only in source, not in the bundle.
 *
 * This gate uses hash-lock, not mtime: computes a SHA-256 of every
 * .ts file under src/ and stores it as `lib/.src-hash`. On check, if the
 * hashes disagree, the bundle is stale. The lock file is auto-written on
 * a successful build (see `WRITE_MODE` below).
 *
 * Usage:
 *   node scripts/verify-vendor-bundles-fresh.mjs        # check mode, exit 1 on stale
 *   node scripts/verify-vendor-bundles-fresh.mjs --write # write mode, called after build
 *
 * Exit codes:
 *   0 — all shipped bundles match their source hash.
 *   1 — one or more bundles are stale.
 *   2 — a tracked package's lib/index.js is missing.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Packages shipped in the packaged Electron app whose bundle must match
 * source. Add here whenever we start shipping a new vendor package that
 * has both a `src/` and a `lib/index.js`.
 */
const GUARDED_PACKAGES = [
  'vendor/deepseek-harness/packages/host/directory-picker-native',
];

/** Where the hash lockfile lives. Kept OUTSIDE the vendored subtree because
 * the vendor's own `.gitignore` excludes `lib/`; a lockfile inside `lib/`
 * would never be tracked by git and CI could not verify against it. */
const LOCK_FILE = resolve(REPO, 'apps/shell/build/vendor-bundle-hashes.json');

const WRITE_MODE = process.argv.includes('--write');

/** SHA-256 of every .ts file under `src/`, sorted by relative path. */
function hashSources(pkgDir) {
  const src = join(pkgDir, 'src');
  if (!existsSync(src)) return null;
  const files = collectTs(src).sort();
  const h = createHash('sha256');
  for (const file of files) {
    h.update(relative(pkgDir, file));
    h.update('\0');
    h.update(readFileSync(file));
    h.update('\0');
  }
  return h.digest('hex');
}

function collectTs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectTs(p));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

let stale = 0;
let missing = 0;
let ok = 0;

const lockData = existsSync(LOCK_FILE)
  ? JSON.parse(readFileSync(LOCK_FILE, 'utf8'))
  : {};
const nextLock = { ...lockData };

for (const rel of GUARDED_PACKAGES) {
  const pkgDir = resolve(REPO, rel);
  const bundle = join(pkgDir, 'lib', 'index.js');
  if (!existsSync(bundle)) {
    console.error(`verify-vendor-bundles-fresh: MISSING ${rel}/lib/index.js`);
    missing++;
    continue;
  }
  const srcHash = hashSources(pkgDir);
  if (!srcHash) {
    console.error(`verify-vendor-bundles-fresh: SKIP ${rel} (no src/)`);
    continue;
  }

  if (WRITE_MODE) {
    nextLock[rel] = srcHash;
    console.log(`verify-vendor-bundles-fresh: WROTE ${rel} = ${srcHash.slice(0, 12)}…`);
    ok++;
    continue;
  }

  const stored = lockData[rel];
  if (stored !== srcHash) {
    console.error(`verify-vendor-bundles-fresh: STALE ${rel}`);
    console.error(`  src hash:    ${srcHash}`);
    console.error(`  bundle hash: ${stored ?? '<not recorded>'}`);
    console.error(`  Fix: (cd vendor/deepseek-harness && npx tsc -p ${relative('vendor/deepseek-harness', pkgDir)}/tsconfig.json && npx tsdown --env.DSH_BUILD_FACE host --filter '@deepseek-ai/dsh-host-directory-picker-native')`);
    console.error(`  Then: node scripts/verify-vendor-bundles-fresh.mjs --write && git add ${relative(REPO, LOCK_FILE)}`);
    stale++;
    continue;
  }
  ok++;
}

if (WRITE_MODE) {
  mkdirSync(dirname(LOCK_FILE), { recursive: true });
  writeFileSync(LOCK_FILE, JSON.stringify(nextLock, null, 2) + '\n', 'utf8');
  console.log(`verify-vendor-bundles-fresh: lock at ${relative(REPO, LOCK_FILE)}`);
}

if (missing > 0) process.exit(2);
if (stale > 0) process.exit(1);
console.log(`verify-vendor-bundles-fresh: ${ok} package(s) fresh.`);
