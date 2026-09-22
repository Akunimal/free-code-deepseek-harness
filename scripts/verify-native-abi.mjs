#!/usr/bin/env node
/**
 * Fail-closed ABI audit for every native addon inside the packaged dsh runtime.
 *
 * dsh runs under Electron with ELECTRON_RUN_AS_NODE=1, so every .node file
 * must be compiled against Electron's ABI — not the build host's Node ABI.
 * A host-Node binary (e.g. ABI 137 on Node 24) crashes the boot loader with
 * ERR_DLOPEN_FAILED and the app never reaches readiness.
 *
 * This probe loads each addon through the exact Electron executable that
 * ships with the app. It exits non-zero when any addon fails with an ABI
 * mismatch, so `prepackage:verify` blocks the installer build.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const runtimeDir = resolve(process.argv[2] ?? join(root, 'apps', 'shell', 'resources', 'freecode', 'dsh'));
const electronBinary = join(root, 'apps', 'shell', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');

if (!existsSync(runtimeDir)) {
  console.error(`verify-native-abi: runtime directory not found: ${runtimeDir}`);
  process.exit(2);
}
if (!existsSync(electronBinary)) {
  console.error(`verify-native-abi: Electron binary not found: ${electronBinary}`);
  process.exit(2);
}

const nodeFiles = [];
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.node')) nodeFiles.push(full);
  }
}
walk(runtimeDir);

if (nodeFiles.length === 0) {
  console.error(`verify-native-abi: no .node addons found under ${runtimeDir}; fail closed`);
  process.exit(2);
}

console.log(`verify-native-abi: probing ${nodeFiles.length} native addons with ${electronBinary}`);

// Single Electron invocation: load every addon, classify failures.
const probeScript = [
  'const results = [];',
  'for (const file of process.argv.slice(1)) {',
  '  try { require(file); results.push({ file, ok: true }); }',
  '  catch (error) {',
  '    const message = String(error && error.message || error);',
  '    const abi = /NODE_MODULE_VERSION (\\d+)[\\s\\S]+?requires\\s+NODE_MODULE_VERSION (\\d+)/.exec(message);',
  '    results.push({ file, ok: false, abiMismatch: Boolean(abi), got: abi && abi[1], want: abi && abi[2], message: message.split("\\n")[0] });',
  '  }',
  '}',
  'process.stdout.write(JSON.stringify(results));',
].join('\n');

const probe = spawnSync(electronBinary, ['-e', probeScript, ...nodeFiles], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
if (probe.error) throw probe.error;
if (probe.status !== 0) {
  console.error(`verify-native-abi: Electron probe exited with code ${String(probe.status)}\n${probe.stderr ?? ''}`);
  process.exit(2);
}

let results;
try {
  results = JSON.parse(probe.stdout);
} catch (error) {
  console.error(`verify-native-abi: probe returned invalid JSON: ${String(probe.stdout).slice(0, 500)}`);
  process.exit(2);
}

const mismatches = results.filter((result) => !result.ok && result.abiMismatch);
const otherFailures = results.filter((result) => !result.ok && !result.abiMismatch);

for (const failure of mismatches) {
  const rel = failure.file.replace(runtimeDir, '');
  console.error(`verify-native-abi: ABI MISMATCH ${rel} — built for ${failure.got}, Electron requires ${failure.want}`);
}
for (const failure of otherFailures) {
  const rel = failure.file.replace(runtimeDir, '');
  console.warn(`verify-native-abi: WARNING load failed (not ABI) ${rel}: ${failure.message}`);
}

if (mismatches.length > 0) {
  console.error(`verify-native-abi: FAIL — ${mismatches.length}/${results.length} addons compiled for the wrong ABI. Run: node scripts/rebuild-runtime-native.mjs`);
  process.exit(1);
}
const loaded = results.filter((result) => result.ok).length;
console.log(`verify-native-abi: PASS — ${loaded}/${results.length} addons load under the packaged Electron (${otherFailures.length} non-ABI skips, e.g. foreign-platform prebuilds)`);
