import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function readRequiredFile(path, label) {
  try {
    return readFileSync(path);
  } catch (error) {
    throw new Error(`runtime dependency pin refresh: ${label} is missing or unreadable at ${path}`, { cause: error });
  }
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Refresh integrity/version pins only for artifacts produced by our local
 * build. External/runtime assets (including Tor) remain explicit reviewed
 * pins and are never silently re-trusted by this helper.
 */
export function refreshRuntimeDependencyPins(manifest, payloadRoot) {
  if (!manifest || !Array.isArray(manifest.dependencies)) {
    throw new Error('runtime dependency pin refresh: invalid dependency manifest');
  }
  const root = resolve(payloadRoot);
  const result = JSON.parse(JSON.stringify(manifest));
  const opencode = result.dependencies.find((dependency) => dependency.id === 'opencode2api');
  const dsh = result.dependencies.find((dependency) => dependency.id === 'dsh-cli');
  if (!opencode?.required || !dsh?.required) {
    throw new Error('runtime dependency pin refresh: required opencode2api and dsh-cli entries must exist');
  }

  const opencodePath = join(root, opencode.path);
  const opencodeBytes = readRequiredFile(opencodePath, 'opencode2api artifact');
  const receiptPath = join(root, 'opencode2api', 'freecode-build-receipt.json');
  const receipt = JSON.parse(readRequiredFile(receiptPath, 'opencode2api build receipt').toString('utf8'));
  const opencodeVersion = typeof receipt.version === 'string' ? receipt.version.replace(/^v/u, '') : '';
  if (!/^\d+\.\d+\.\d+$/u.test(opencodeVersion)) {
    throw new Error(`runtime dependency pin refresh: invalid opencode2api build version ${String(receipt.version)}`);
  }
  opencode.version = opencodeVersion;
  opencode.sha256 = sha256(opencodeBytes);

  const dshPath = join(root, dsh.path);
  const dshBytes = readRequiredFile(dshPath, 'dsh-cli artifact');
  const dshPackagePath = join(root, 'dsh', 'apps', 'cli', 'package.json');
  const dshPackage = JSON.parse(readRequiredFile(dshPackagePath, 'dsh-cli package manifest').toString('utf8'));
  if (typeof dshPackage.version !== 'string' || dshPackage.version.length === 0) {
    throw new Error('runtime dependency pin refresh: dsh-cli package manifest has no version');
  }
  dsh.version = dshPackage.version;
  dsh.sha256 = sha256(dshBytes);

  return result;
}
