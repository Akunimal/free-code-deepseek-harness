import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'freecode-packaged-electron-'));
  roots.push(root);
  const appOutDir = join(root, 'win-unpacked');
  const runtimeDir = join(root, 'dsh');
  const executableName = 'FreeCode DeepSeek Harness.exe';
  mkdirSync(appOutDir, { recursive: true });
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(join(appOutDir, executableName), 'fixture');
  writeFileSync(join(runtimeDir, 'package.json'), JSON.stringify({
    engines: { node: '^22.19.0 || >=24.0.0' },
  }));
  mkdirSync(join(appOutDir, 'resources', 'freecode'), { recursive: true });
  writeFileSync(join(appOutDir, 'resources', 'freecode', 'runtime-manifest.json'), JSON.stringify({
    version: '0.2.1-alpha.1',
    nodeModuleVersion: '149',
  }));
  return { root, appOutDir, runtimeDir, executableName };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface VerifierOptions {
  appOutDir: string;
  runtimeDir: string;
  executableName: string;
  expectedElectronVersion: string;
  probeRuntime?: (path: string) => {
    electronVersion: string;
    nodeVersion: string;
    nodeModuleVersion: string;
    nativeLoaderCompatible?: boolean;
    nativeLoaderError?: string;
  };
}

interface VerifierResult {
  ok: boolean;
  error?: string;
  electronVersion?: string;
  nodeVersion?: string;
  nodeModuleVersion?: string;
}

async function loadVerifier(): Promise<{
  verifyPackagedElectronRuntime(options: VerifierOptions): VerifierResult;
}> {
  const modulePath = new URL('../../../scripts/verify-packaged-electron-runtime.mjs', import.meta.url).href;
  return await import(modulePath) as {
    verifyPackagedElectronRuntime(options: VerifierOptions): VerifierResult;
  };
}

describe('packaged Electron runtime gate', () => {
  it('probes the executable in appOutDir and rejects stale Electron 35 output', async () => {
    const paths = fixture();
    const probeRuntime = vi.fn(() => ({ electronVersion: '35.7.5', nodeVersion: 'v22.16.0', nodeModuleVersion: '133' }));
    const { verifyPackagedElectronRuntime } = await loadVerifier();

    const result = verifyPackagedElectronRuntime({
      ...paths,
      expectedElectronVersion: '44.0.0',
      probeRuntime,
    });

    expect(probeRuntime).toHaveBeenCalledWith(join(paths.appOutDir, paths.executableName));
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/35\.7\.5/);
  });

  it('rejects a packaged runtime that violates the staged DSH Node engine range', async () => {
    const paths = fixture();
    const { verifyPackagedElectronRuntime } = await loadVerifier();

    const result = verifyPackagedElectronRuntime({
      ...paths,
      expectedElectronVersion: '44.0.0',
      probeRuntime: () => ({ electronVersion: '44.0.0', nodeVersion: 'v22.16.0', nodeModuleVersion: '133', nativeLoaderCompatible: true }),
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/does not satisfy DSH engines\.node/);
  });

  it('rejects appOutDir when its Electron fingerprint cannot load the DSH native internal loader', async () => {
    const paths = fixture();
    const { verifyPackagedElectronRuntime } = await loadVerifier();

    const result = verifyPackagedElectronRuntime({
      ...paths,
      expectedElectronVersion: '44.0.0',
      probeRuntime: () => ({
        electronVersion: '44.0.0',
        nodeVersion: 'v24.18.1',
        nodeModuleVersion: '149',
        nativeLoaderCompatible: false,
        nativeLoaderError: 'Unsupported/no-context (unsupported Electron runtime fingerprint)',
      }),
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/cannot load the DSH native internal loader.*Unsupported\/no-context/);
  });

  it('accepts the expected packaged Electron when its embedded Node satisfies DSH', async () => {
    const paths = fixture();
    const { verifyPackagedElectronRuntime } = await loadVerifier();

    expect(verifyPackagedElectronRuntime({
      ...paths,
      expectedElectronVersion: '44.0.0',
      probeRuntime: () => ({
        electronVersion: '44.0.0',
        nodeVersion: 'v24.18.1',
        nodeModuleVersion: '149',
        nativeLoaderCompatible: true,
      }),
    })).toMatchObject({
      ok: true,
      electronVersion: '44.0.0',
      nodeVersion: 'v24.18.1',
      nodeModuleVersion: '149',
    });
  });

  it('rejects appOutDir when its compatibility manifest requires a different native ABI', async () => {
    const paths = fixture();
    const { verifyPackagedElectronRuntime } = await loadVerifier();

    const result = verifyPackagedElectronRuntime({
      ...paths,
      expectedElectronVersion: '44.0.0',
      probeRuntime: () => ({ electronVersion: '44.0.0', nodeVersion: 'v24.18.1', nodeModuleVersion: '133', nativeLoaderCompatible: true }),
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/manifest requires NODE_MODULE_VERSION 149, but appOutDir Electron provides 133/);
  });

  it('fails closed when the appOutDir does not contain the expected executable', async () => {
    const paths = fixture();
    rmSync(join(paths.appOutDir, paths.executableName));
    const { verifyPackagedElectronRuntime } = await loadVerifier();

    expect(verifyPackagedElectronRuntime({
      ...paths,
      expectedElectronVersion: '44.0.0',
      probeRuntime: vi.fn(),
    })).toMatchObject({ ok: false, error: expect.stringContaining('not found') });
  });
});
