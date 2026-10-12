import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export function resolveNsisSetup({ releaseDir, version, setupPath }) {
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('nsis-smoke-setup: package version is required');
  }
  const expectedName = `FreeCode-DeepSeek-Harness-${version}-win-x64-setup.exe`;
  const selectedPath = resolve(setupPath ?? join(releaseDir, expectedName));
  if (basename(selectedPath) !== expectedName) {
    throw new Error(`nsis-smoke-setup: setup path does not match package version ${version}: ${selectedPath}`);
  }
  if (!existsSync(selectedPath)) {
    throw new Error(`nsis-smoke-setup: exact setup for package version ${version} was not found: ${selectedPath}`);
  }
  return selectedPath;
}
