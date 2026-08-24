import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resourcesDir = resolve(root, 'apps/shell/resources/freecode');
const harnessDir = join(resourcesDir, 'dsh');
const manifest = JSON.parse(readFileSync(join(resourcesDir, 'runtime-manifest.json'), 'utf8'));
const version = typeof manifest.version === 'string' ? manifest.version : undefined;
if (!version) throw new Error('package-harness-update: runtime manifest has no version');

const platform = process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';
const assetName = `deepseek-harness-runtime-${version}-${platform}-${process.arch}.tar.gz`;
const releaseDir = resolve(root, 'apps/shell/release');
const archivePath = join(releaseDir, assetName);
const digestPath = `${archivePath}.sha256`;

mkdirSync(releaseDir, { recursive: true });
rmSync(archivePath, { force: true });
rmSync(digestPath, { force: true });

const relArchive = relative(root, archivePath);
const relResources = relative(root, resourcesDir);
const result = spawnSync('tar', ['-czf', relArchive, '-C', relResources, 'dsh', 'runtime-manifest.json'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: process.platform === 'win32',
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`package-harness-update: tar failed with exit ${result.status ?? 'unknown'}`);

const digest = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
writeFileSync(digestPath, `${digest}  ${assetName}\n`);
console.log(`package-harness-update: wrote ${archivePath}`);
console.log(`package-harness-update: sha256 ${digest}`);
