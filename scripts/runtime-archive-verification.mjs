import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sha256File } from './sha256-file.mjs';

const platformName = (platform) => platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';

export async function verifyRuntimeArchive({ archivePath, checksumPath, manifestPath, platform, arch, hashFile = sha256File }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error('runtime-archive-verification: runtime manifest has no version');
  }
  const expectedName = `deepseek-harness-runtime-${manifest.version}-${platformName(platform)}-${arch}.tar.gz`;
  const actualName = basename(archivePath);
  if (actualName !== expectedName) {
    throw new Error(`runtime-archive-verification: asset name does not match pinned manifest: expected ${expectedName}, got ${actualName}`);
  }

  const checksumText = (await readFile(checksumPath, 'utf8')).trim();
  const match = checksumText.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
  if (!match || match[2] !== expectedName) {
    throw new Error(`runtime-archive-verification: checksum file must contain a SHA-256 and exact asset name ${expectedName}`);
  }
  const actualDigest = await hashFile(archivePath);
  if (actualDigest.toLowerCase() !== match[1].toLowerCase()) {
    throw new Error(`runtime-archive-verification: SHA-256 mismatch for ${expectedName}`);
  }

  return { version: manifest.version, assetName: expectedName, digest: actualDigest.toLowerCase() };
}
