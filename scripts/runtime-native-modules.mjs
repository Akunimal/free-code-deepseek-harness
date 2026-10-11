import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function findFsExtDirectory(runtimeDir) {
  const fsExtDir = join(runtimeDir, 'node_modules', 'fs-ext');
  return existsSync(join(fsExtDir, 'binding.gyp')) ? fsExtDir : undefined;
}
