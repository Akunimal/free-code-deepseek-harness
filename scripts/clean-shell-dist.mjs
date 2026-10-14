import { lstatSync, rmSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export function cleanShellDist(shellRoot) {
  const root = resolve(shellRoot);
  const target = join(root, 'dist');
  if (relative(root, target) !== 'dist') throw new Error('Unsafe shell output path');
  try {
    if (lstatSync(target).isSymbolicLink()) throw new Error('Shell output symlink/junction refused');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  rmSync(target, { recursive: true, force: true });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  cleanShellDist(fileURLToPath(new URL('../apps/shell', import.meta.url)));
}
