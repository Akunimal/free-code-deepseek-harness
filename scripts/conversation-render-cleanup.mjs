import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';

const transientCleanupCodes = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);
const ownedProfileName = /^freecode-conversation-(?:normal|reduced)-[A-Za-z0-9_-]+$/u;

const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

/**
 * Remove only a renderer-owned direct child of the OS temp directory. Windows
 * can briefly retain Chromium profile handles after its process exits, so retry
 * only known transient filesystem errors with a bounded exponential backoff.
 */
export async function removeRendererProfile(profile, {
  remove = rmSync,
  wait = delay,
  maxRetries = 6,
  retryDelayMs = 100,
} = {}) {
  const absolute = resolve(profile);
  const temporaryRoot = resolve(tmpdir());
  const samePath = process.platform === 'win32'
    ? (left, right) => left.toLowerCase() === right.toLowerCase()
    : (left, right) => left === right;

  if (!samePath(dirname(absolute), temporaryRoot) || !ownedProfileName.test(basename(absolute))) {
    throw new Error(`conversation renderer: refusing to clean outside an owned renderer profile: ${absolute}`);
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || !Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new TypeError('conversation renderer: invalid profile cleanup retry policy');
  }

  for (let retry = 0; ; retry += 1) {
    try {
      remove(absolute, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!transientCleanupCodes.has(error?.code) || retry >= maxRetries) throw error;
      await wait(retryDelayMs * (2 ** retry));
    }
  }
}
