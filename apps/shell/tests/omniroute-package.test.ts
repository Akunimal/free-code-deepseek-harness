import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const packageManifest = new URL('../omniroute-runtime/package.json', import.meta.url);
const stageScript = new URL('../../../scripts/prepare-omniroute-runtime.mjs', import.meta.url);
const verifierScript = new URL('../../../scripts/verify-omniroute-runtime.mjs', import.meta.url);
const builderConfig = new URL('../electron-builder.yml', import.meta.url);
const shellManifest = new URL('../package.json', import.meta.url);

describe('downloadable OmniRoute runtime package contract', () => {
  it('keeps pinned source inputs in Git while excluding generated runtime data', () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    for (const file of ['package.json', 'package-lock.json']) {
      const result = spawnSync('git', ['check-ignore', '--no-index', `apps/shell/omniroute-runtime/${file}`], {
        cwd: repoRoot, encoding: 'utf8', windowsHide: true,
      });
      expect(result.status, `Pinned source input must not be ignored: ${file}`).toBe(1);
    }
    for (const file of ['node_modules/omniroute/package.json', 'build/runtime.tar.gz', 'runtime-manifest.json']) {
      const result = spawnSync('git', ['check-ignore', '--no-index', `apps/shell/omniroute-runtime/${file}`], {
        cwd: repoRoot, encoding: 'utf8', windowsHide: true,
      });
      expect(result.status, `Generated runtime must remain ignored: ${file}`).toBe(0);
    }
  });

  it('pins the authorized OmniRoute release in an isolated runtime package', () => {
    const manifest = JSON.parse(readFileSync(packageManifest, 'utf8')) as {
      name?: string;
      private?: boolean;
      version?: string;
      dependencies?: Record<string, string>;
    };

    expect(manifest).toMatchObject({
      name: '@freecode/omniroute-runtime',
      private: true,
      version: '1.0.0',
      dependencies: { omniroute: '3.8.51' },
    });
  });

  it('stages the production dependency closure without lifecycle scripts or optional packages', () => {
    const stage = readFileSync(stageScript, 'utf8');
    const verifier = readFileSync(verifierScript, 'utf8');
    const scripts = JSON.parse(readFileSync(shellManifest, 'utf8')).scripts as Record<string, string>;

    expect(stage).toContain('npm ci');
    expect(stage).toContain('--omit=dev');
    expect(stage).toContain('--omit=optional');
    expect(stage).toContain('--ignore-scripts');
    expect(stage).toContain('https://registry.npmjs.org');
    expect(stage).toContain('`omniroute-runtime-${expectedVersion}.tar.gz`');
    expect(stage).toContain('createHash');
    expect(stage).toContain('omniroute-runtime.json');
    expect(verifier).toContain('3.8.51');
    expect(scripts['prepare:omniroute-runtime']).toContain('prepare-omniroute-runtime.mjs');
    expect(scripts['prepackage:verify']).not.toContain('prepare-omniroute-runtime.mjs');
    expect(scripts['prepackage:verify']).toContain('verify-omniroute-runtime.mjs');
  });

  it('ships a small OmniRoute bootstrap manifest and never bundles the runtime tree', () => {
    const config = readFileSync(builderConfig, 'utf8');
    expect(config).toContain('omniroute-runtime.json');
    expect(config).not.toContain('omniroute-runtime/node_modules');
    expect(config).not.toContain('to: freecode/omniroute/node_modules');
  });

  it('pins the complete install to public npm package integrity records', () => {
    const lock = JSON.parse(readFileSync(new URL('../omniroute-runtime/package-lock.json', import.meta.url), 'utf8')) as {
      lockfileVersion?: number;
      packages?: Record<string, { resolved?: string; integrity?: string }>;
    };
    const packages = Object.entries(lock.packages ?? {}).filter(([name]) => name !== '');

    expect(lock.lockfileVersion).toBe(3);
    expect(packages.length).toBeGreaterThan(100);
    expect(packages.every(([, entry]) => entry.resolved?.startsWith('https://registry.npmjs.org/'))).toBe(true);
    expect(packages.every(([, entry]) => typeof entry.integrity === 'string' && entry.integrity.startsWith('sha512-'))).toBe(true);
  });

  it('fails packaging when the pinned headless entry or postinstall-colocated runtimes are absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-contract-'));
    try {
      const omniRoot = join(root, 'node_modules', 'omniroute');
      const runtimeRoot = join(omniRoot, 'dist', 'node_modules');
      const directDependency = join(root, 'node_modules', 'fixture-dependency');
      mkdirSync(join(omniRoot, 'dist'), { recursive: true });
      mkdirSync(join(runtimeRoot, 'sql.js'), { recursive: true });
      mkdirSync(join(runtimeRoot, 'node-machine-id'), { recursive: true });
      mkdirSync(directDependency, { recursive: true });
      writeJson(join(root, 'package.json'), { dependencies: { omniroute: '3.8.51' } });
      writeJson(join(root, 'package-lock.json'), {
        packages: {
          '': { dependencies: { omniroute: '3.8.51' } },
          'node_modules/omniroute': { version: '3.8.51' },
        },
      });
      writeJson(join(omniRoot, 'package.json'), {
        version: '3.8.51',
        engines: { node: '>=22.22.2 <23 || >=24.0.0 <27' },
        dependencies: { 'fixture-dependency': '1.0.0' },
      });
      writeJson(join(runtimeRoot, 'sql.js', 'package.json'), { name: 'sql.js' });
      writeJson(join(runtimeRoot, 'node-machine-id', 'package.json'), { name: 'node-machine-id' });
      writeJson(join(directDependency, 'package.json'), { name: 'fixture-dependency', version: '1.0.0' });
      writeFileSync(join(omniRoot, 'dist', 'server.js'), 'export {};', 'utf8');

      const result = spawnSync(process.execPath, [fileURLToPath(verifierScript), root], {
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(result.status, result.stderr).toBe(0);

      rmSync(join(omniRoot, 'dist', 'server.js'));
      const incomplete = spawnSync(process.execPath, [fileURLToPath(verifierScript), root], {
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(incomplete.status).not.toBe(0);
      expect(incomplete.stderr).toContain('headless dist/server.js entry is missing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an archive unless its checksum, pinned URL, and internal manifest all agree', () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-archive-contract-'));
    try {
      const omniRoot = join(root, 'node_modules', 'omniroute');
      const runtimeRoot = join(omniRoot, 'dist', 'node_modules');
      const directDependency = join(root, 'node_modules', 'fixture-dependency');
      mkdirSync(join(omniRoot, 'dist'), { recursive: true });
      mkdirSync(join(runtimeRoot, 'sql.js'), { recursive: true });
      mkdirSync(join(runtimeRoot, 'node-machine-id'), { recursive: true });
      mkdirSync(directDependency, { recursive: true });
      writeJson(join(root, 'package.json'), { dependencies: { omniroute: '3.8.51' } });
      writeJson(join(root, 'package-lock.json'), {
        packages: {
          '': { dependencies: { omniroute: '3.8.51' } },
          'node_modules/omniroute': { version: '3.8.51' },
        },
      });
      writeJson(join(omniRoot, 'package.json'), {
        version: '3.8.51',
        engines: { node: '>=22.22.2 <23 || >=24.0.0 <27' },
        dependencies: { 'fixture-dependency': '1.0.0' },
      });
      writeJson(join(runtimeRoot, 'sql.js', 'package.json'), { name: 'sql.js' });
      writeJson(join(runtimeRoot, 'node-machine-id', 'package.json'), { name: 'node-machine-id' });
      writeJson(join(directDependency, 'package.json'), { name: 'fixture-dependency', version: '1.0.0' });
      writeFileSync(join(omniRoot, 'dist', 'server.js'), 'export {};', 'utf8');
      writeJson(join(root, 'runtime-manifest.json'), {
        version: '3.8.51',
        entry: 'node_modules/omniroute/dist/server.js',
      });

      const archivePath = join(root, 'omniroute-runtime-3.8.51.tar.gz');
      const archiveBytes = Buffer.from('immutable runtime bytes');
      writeFileSync(archivePath, archiveBytes);
      const descriptorPath = join(root, 'omniroute-runtime.json');
      const descriptor = {
        schemaVersion: 1,
        appVersion: '0.9.4',
        version: '3.8.51',
        platform: 'any',
        assetName: 'omniroute-runtime-3.8.51.tar.gz',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.4/omniroute-runtime-3.8.51.tar.gz',
        sha256: createHash('sha256').update(archiveBytes).digest('hex'),
        sizeBytes: archiveBytes.length,
        entry: 'node_modules/omniroute/dist/server.js',
      };
      writeJson(descriptorPath, descriptor);

      const verify = () => spawnSync(process.execPath, [
        fileURLToPath(verifierScript), root, descriptorPath, archivePath, '0.9.4',
      ], { encoding: 'utf8', windowsHide: true });
      expect(verify().status).toBe(0);

      writeJson(descriptorPath, { ...descriptor, sha256: '0'.repeat(64) });
      expect(verify().stderr).toContain('runtime archive SHA-256 does not match the descriptor');

      writeJson(descriptorPath, {
        ...descriptor,
        assetUrl: 'https://registry.npmjs.org/omniroute/-/omniroute-3.8.51.tgz',
      });
      expect(verify().stderr).toContain('pinned fork release asset URL');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}
