#!/usr/bin/env node
// Build resources/freecode/searxng-runtime from pinned, hash-checked inputs.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shell = resolve(here, '../apps/shell');
const source = join(shell, 'resources/freecode/searxng-search');
const out = join(shell, 'resources/freecode/searxng-runtime');
const pinText = readFileSync(join(here, 'searxng/pin.json'), 'utf8');
const lockPath = join(here, 'searxng/requirements.lock');
const pin = JSON.parse(pinText);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = sha(pinText + readFileSync(lockPath, 'utf8') + readFileSync(join(source, 'pwd.py'), 'utf8'));
const stampPath = join(out, 'stage-stamp.txt');

if (process.platform !== 'win32') { console.log('stage-searxng-runtime: skipped, Windows only'); process.exit(0); }
if (existsSync(stampPath) && readFileSync(stampPath, 'utf8').trim() === stamp) {
  console.log('stage-searxng-runtime: up to date');
  process.exit(0);
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} exited with ${result.status}`);
}
async function download(input, file) {
  const response = await fetch(input.url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`download failed ${response.status}: ${input.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha(bytes) !== input.sha256) throw new Error(`SHA-256 mismatch: ${input.url}`);
  writeFileSync(file, bytes);
}

const bundledUv = join(shell, 'resources/freecode/uv/uv.exe');
const uv = existsSync(bundledUv) ? bundledUv : 'uv';
const bsdtar = join(process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', 'tar.exe');
const work = mkdtempSync(join(tmpdir(), 'searxng-stage-'));
try {
  const staged = join(work, 'runtime');
  for (const dir of ['python', 'app', 'site-packages']) mkdirSync(join(staged, dir), { recursive: true });

  await download(pin.python, join(work, 'python.zip'));
  run(bsdtar, ['-xf', join(work, 'python.zip'), '-C', join(staged, 'python')]);
  writeFileSync(join(staged, 'python/python313._pth'), 'python313.zip\n.\n..\\site-packages\n..\\app\nimport site\n');

  await download(pin.searxng, join(work, 'searxng.tgz'));
  const src = join(work, 'src');
  mkdirSync(src);
  run(bsdtar, ['-xzf', join(work, 'searxng.tgz'), '-C', src, '--strip-components=1', '--include=*/searx/*', '--include=*/LICENSE']);
  cpSync(join(src, 'searx'), join(staged, 'app/searx'), { recursive: true });
  cpSync(join(source, 'pwd.py'), join(staged, 'app/pwd.py'));
  cpSync(join(src, 'LICENSE'), join(staged, 'SEARXNG-LICENSE.txt'));
  writeFileSync(join(staged, 'SOURCE.txt'), `SearXNG (AGPL-3.0), unmodified: https://github.com/searxng/searxng/tree/${pin.searxng.commit}\n`);

  run(uv, ['pip', 'install', '--target', join(staged, 'site-packages'), '--python-version', '3.13',
    '--python-platform', 'windows', '--only-binary', ':all:', '--require-hashes', '-r', lockPath]);
  run(join(staged, 'python/python.exe'), ['-m', 'compileall', '-q', '--invalidation-mode', 'unchecked-hash',
    join(staged, 'app'), join(staged, 'site-packages')]);

  writeFileSync(join(staged, 'stage-stamp.txt'), `${stamp}\n`);
  rmSync(out, { recursive: true, force: true });
  cpSync(staged, out, { recursive: true });
  console.log(`stage-searxng-runtime: staged ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
