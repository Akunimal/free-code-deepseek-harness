import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

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
  if (result.dependencies.some((dependency) => dependency.id === 'opencode2api'
    || /opencode2api/i.test(dependency.path ?? ''))) {
    throw new Error('runtime dependency pin refresh: retired OpenCode2API dependencies are forbidden');
  }
  const phoenix = result.dependencies.find((dependency) => dependency.id === 'phoenix');
  const dsh = result.dependencies.find((dependency) => dependency.id === 'dsh-cli');
  if (!phoenix?.required || !dsh?.required) {
    throw new Error('runtime dependency pin refresh: required Phoenix and dsh-cli entries must exist');
  }

  const phoenixPath = resolve(root, phoenix.path);
  const relativePhoenixPath = relative(root, phoenixPath);
  if (!relativePhoenixPath || relativePhoenixPath === '..' || relativePhoenixPath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error('runtime dependency pin refresh: Phoenix artifact path must remain inside the payload root');
  }
  const phoenixBytes = readRequiredFile(phoenixPath, 'Phoenix FreeLLMpool artifact');
  const receiptPath = join(dirname(phoenixPath), 'freecode-build-receipt.json');
  const receipt = JSON.parse(readRequiredFile(receiptPath, 'Phoenix FreeLLMpool build receipt').toString('utf8'));
  const phoenixVersion = typeof receipt.upstream?.version === 'string' ? receipt.upstream.version.replace(/^v/u, '') : '';
  if (receipt.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/u.test(phoenixVersion)
    || receipt.binarySha256 !== sha256(phoenixBytes)) {
    throw new Error('runtime dependency pin refresh: Phoenix build receipt is invalid or does not match the artifact');
  }
  phoenix.version = phoenixVersion;
  phoenix.sha256 = sha256(phoenixBytes);

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
