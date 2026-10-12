import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readHarnessRuntimeRequirements } from '../src/main/harness-updater.js';

const roots: string[] = [];
const manifestVerifier = new URL('../../../scripts/verify-runtime-manifest.mjs', import.meta.url);
const runtimePackager = new URL('../../../scripts/package-runtime.sh', import.meta.url);

function temporaryManifest(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), 'freecode-runtime-compatibility-'));
  roots.push(root);
  const path = join(root, 'runtime-manifest.json');
  writeFileSync(path, contents);
  return path;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('packaged DSH compatibility manifest', () => {
  it('provides the minimum runtime version and Electron native ABI requirement', () => {
    const path = temporaryManifest(JSON.stringify({
      version: '0.2.1-alpha.2',
      nodeModuleVersion: process.versions.modules,
      cli: 'dsh/apps/cli/lib/bin.js',
    }));

    expect(readHarnessRuntimeRequirements(path)).toEqual({
      minimumVersion: '0.2.1-alpha.2',
      nodeModuleVersion: process.versions.modules,
    });
  });

  it('fails closed when the package manifest is missing the native ABI contract', () => {
    const path = temporaryManifest(JSON.stringify({
      version: '0.2.1-alpha.2',
      cli: 'dsh/apps/cli/lib/bin.js',
    }));

    expect(() => readHarnessRuntimeRequirements(path)).toThrow(/no valid nodeModuleVersion/);
  });

  it('rejects a package manifest generated for a different Electron ABI', () => {
    const path = temporaryManifest(JSON.stringify({
      version: '0.2.1-alpha.2',
      nodeModuleVersion: '133',
      cli: 'dsh/apps/cli/lib/bin.js',
    }));

    expect(() => readHarnessRuntimeRequirements(path)).toThrow(
      new RegExp(`Electron NODE_MODULE_VERSION ${process.versions.modules} does not match packaged DSH ABI requirement 133`),
    );
  });

  it('requires the generated runtime manifest gate to validate native ABI metadata', () => {
    const path = temporaryManifest(JSON.stringify({
      version: '0.2.1-alpha.2',
      nodeModuleVersion: process.versions.modules,
      cli: 'dsh/apps/cli/lib/bin.js',
      install: 'core-allowlist',
      optionalProviders: 'external-only',
    }));
    const accepted = spawnSync(process.execPath, [fileURLToPath(manifestVerifier), path], { encoding: 'utf8', windowsHide: true });
    expect(accepted.status, accepted.stderr).toBe(0);

    const missingAbi = temporaryManifest(JSON.stringify({
      version: '0.2.1-alpha.2',
      cli: 'dsh/apps/cli/lib/bin.js',
      install: 'core-allowlist',
      optionalProviders: 'external-only',
    }));
    const rejected = spawnSync(process.execPath, [fileURLToPath(manifestVerifier), missingAbi], { encoding: 'utf8', windowsHide: true });
    expect(rejected.status).not.toBe(0);
    expect(`${rejected.stdout}\n${rejected.stderr}`).toMatch(/invalid nodeModuleVersion/);
  });

  it('generates the ABI from the same Electron executable used to run the shell', () => {
    const script = readFileSync(runtimePackager, 'utf8');
    expect(script).toContain('process.versions.modules');
    expect(script).toContain('ELECTRON_RUN_AS_NODE');
    expect(script).toContain('nodeModuleVersion');
  });
});
