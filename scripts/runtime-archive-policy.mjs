import { existsSync } from 'node:fs';

export function assertRuntimeArchiveDestinationIsFree(archivePath, checksumPath, exists = existsSync) {
  const existing = [archivePath, checksumPath].filter((path) => exists(path));
  if (existing.length > 0) {
    throw new Error(
      `package-harness-update: refusing to overwrite an existing versioned runtime asset: ${existing.join(', ')}. ` +
      'Published runtime versions are immutable; bump runtime-manifest.json before packaging a new archive.',
    );
  }
}
