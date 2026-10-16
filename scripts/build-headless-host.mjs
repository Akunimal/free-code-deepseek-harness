import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyWindowsPeFile } from './windows-pe.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'apps/shell/native/headless-host');
const defaultOutput = join(root, 'apps/shell/resources/freecode');
const digest = data => createHash('sha256').update(data).digest('hex');

export function headlessHostSourceDigest() {
  const hash = createHash('sha256');
  for (const name of readdirSync(sourceDir).filter(name => name.endsWith('.go') || name === 'go.mod').sort()) {
    hash.update(name).update('\0').update(readFileSync(join(sourceDir, name))).update('\0');
  }
  return hash.digest('hex');
}

export async function verifyHeadlessHost(outputDir = defaultOutput, expectedSource) {
  const executable = join(outputDir, 'headless-host.exe');
  await verifyWindowsPeFile(executable, 'headless-host');
  const bytes = readFileSync(executable);
  const pe = bytes.readUInt32LE(0x3c);
  if (pe + 94 > bytes.length || bytes.readUInt16LE(pe + 4) !== 0x8664 || bytes.readUInt16LE(pe + 24) !== 0x20b) {
    throw new Error('headless-host: expected Windows x64 PE32+');
  }
  if (bytes.readUInt16LE(pe + 92) !== 2) throw new Error('headless-host: native helper must use Windows GUI subsystem');
  const manifest = JSON.parse(readFileSync(join(outputDir, 'headless-host.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || typeof manifest.source !== 'string'
    || (expectedSource !== undefined && manifest.source !== expectedSource)) {
    throw new Error('headless-host: stale or missing source attestation');
  }
  if (manifest.sha256 !== digest(bytes)) throw new Error('headless-host: binary SHA-256 mismatch');
  return { executable, ...manifest };
}

export async function buildHeadlessHost() {
  if (process.platform !== 'win32') return; // Other platforms keep their own spawn policy.
  const source = headlessHostSourceDigest();
  try { await verifyHeadlessHost(defaultOutput, source); return; } catch { /* Rebuild stale or missing local output. */ }
  mkdirSync(defaultOutput, { recursive: true });
  execFileSync('go', ['build', '-trimpath', '-buildvcs=false', '-ldflags', `-H=windowsgui -s -w -X main.sourceID=${source}`,
    '-o', join(defaultOutput, 'headless-host.exe'), '.'], {
    cwd: sourceDir, windowsHide: true, shell: false, stdio: 'pipe',
    env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off' },
  });
  writeFileSync(join(defaultOutput, 'headless-host.json'), JSON.stringify({
    schemaVersion: 1, source, sha256: digest(readFileSync(join(defaultOutput, 'headless-host.exe'))),
  }, null, 2) + '\n');
  await verifyHeadlessHost(defaultOutput, source);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform === 'win32') {
    if (process.argv.includes('--verify')) await verifyHeadlessHost(defaultOutput, headlessHostSourceDigest());
    else await buildHeadlessHost();
    console.log('headless-host: Windows GUI helper and source/binary attestation verified (offline build).');
  }
}
