import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Verify the complete Tor payload both before packaging and after electron-builder copies it. */
export function verifyTorRuntimeAssets(resourcesRoot, expectedTorSha256) {
  const root = resolve(resourcesRoot);
  const torDir = join(root, 'tor');
  const required = ['tor.exe', 'geoip', 'geoip6'];
  const missing = required.filter((name) => {
    const path = join(torDir, name);
    try {
      const stat = statSync(path);
      return !stat.isFile() || stat.size === 0;
    } catch {
      return true;
    }
  });
  if (missing.length > 0) {
    throw new Error(`Tor runtime resources missing or empty: ${missing.map((name) => join('tor', name)).join(', ')}`);
  }

  if (!/^[a-f\d]{64}$/iu.test(expectedTorSha256)) {
    throw new Error('Tor runtime manifest does not contain a valid executable SHA-256');
  }
  const executable = join(torDir, 'tor.exe');
  const sha256 = createHash('sha256').update(readFileSync(executable)).digest('hex');
  if (sha256.toLowerCase() !== expectedTorSha256.toLowerCase()) {
    throw new Error(`Tor executable SHA-256 mismatch: expected ${expectedTorSha256}, got ${sha256}`);
  }

  return {
    executable,
    geoipFiles: [join(torDir, 'geoip'), join(torDir, 'geoip6')],
    sha256,
  };
}
