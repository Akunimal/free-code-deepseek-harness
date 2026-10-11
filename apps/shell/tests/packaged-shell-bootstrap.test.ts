import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];
const packagedMainPath = join('dist', 'src', 'main', 'index.js');
const shellRequire = createRequire(new URL('../package.json', import.meta.url));
const builderRequire = createRequire(shellRequire.resolve('electron-builder/package.json'));
const asar = builderRequire('@electron/asar') as {
  createPackage(sourceDir: string, archivePath: string): Promise<unknown>;
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'freecode-shell-bootstrap-'));
  roots.push(root);
  const appOutDir = join(root, 'win-unpacked');
  const archivePath = join(appOutDir, 'resources', 'app.asar');
  mkdirSync(join(appOutDir, 'resources'), { recursive: true });
  writeFileSync(archivePath, 'asar fixture');
  return { appOutDir, archivePath };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function loadVerifier() {
  const modulePath = new URL('../../../scripts/verify-packaged-shell-bootstrap.mjs', import.meta.url).href;
  return await import(modulePath) as {
    verifyPackagedShellBootstrap(options: {
      appOutDir: string;
      extractFile?: (archivePath: string, filePath: string) => Buffer | string;
    }): { ok: boolean; error?: string };
  };
}

describe('packaged shell bootstrap gate', () => {
  it('rejects a legacy app.asar main that preflights the DSH payload without bootstrapping it', async () => {
    const paths = fixture();
    const extractFile = vi.fn(() => Buffer.from('await awaitHarnessLayout({ resourcesDir });'));
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    const result = verifyPackagedShellBootstrap({ ...paths, extractFile });

    expect(extractFile).toHaveBeenCalledWith(paths.archivePath, packagedMainPath);
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/first-run DSH bootstrap/);
  });

  it('accepts a packaged main that invokes runtime setup before preflight', async () => {
    const paths = fixture();
    const bundledMain = [
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir) {',
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir });',
      '}',
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir))) return;',
      'await awaitHarnessLayout({ resourcesDir });',
    ].join('\n');
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    expect(verifyPackagedShellBootstrap({ ...paths, extractFile: () => bundledMain }))
      .toMatchObject({ ok: true });
  });

  it('extracts the main entry from a real app.asar using the host archive path format', async () => {
    const paths = fixture();
    const sourceRoot = join(paths.appOutDir, 'stage');
    const mainPath = join(sourceRoot, packagedMainPath);
    const bundledMain = [
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir) {',
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir });',
      '}',
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir))) return;',
      'await awaitHarnessLayout({ resourcesDir });',
    ].join('\n');
    mkdirSync(join(sourceRoot, 'dist', 'src', 'main'), { recursive: true });
    writeFileSync(mainPath, bundledMain);
    rmSync(paths.archivePath);
    await asar.createPackage(sourceRoot, paths.archivePath);
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    expect(verifyPackagedShellBootstrap({ appOutDir: paths.appOutDir }))
      .toMatchObject({ ok: true, entryPath: packagedMainPath });
  });

  it('rejects a bootstrap call placed after DSH preflight', async () => {
    const paths = fixture();
    const bundledMain = [
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir) {',
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir });',
      '}',
      'await awaitHarnessLayout({ resourcesDir });',
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir))) return;',
    ].join('\n');
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    const result = verifyPackagedShellBootstrap({ ...paths, extractFile: () => bundledMain });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/before DSH preflight/);
  });

  it('fails closed when app.asar is missing or cannot be read', async () => {
    const paths = fixture();
    const { verifyPackagedShellBootstrap } = await loadVerifier();
    rmSync(paths.archivePath);

    expect(verifyPackagedShellBootstrap({ ...paths, extractFile: vi.fn() }))
      .toMatchObject({ ok: false, error: expect.stringContaining('app.asar not found') });

    writeFileSync(paths.archivePath, 'asar fixture');
    expect(verifyPackagedShellBootstrap({
      ...paths,
      extractFile: () => { throw new Error('corrupt archive'); },
    })).toMatchObject({ ok: false, error: expect.stringContaining('corrupt archive') });
  });

  it('builds the shell before electron-builder in the package workflow', () => {
    const shellPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const packagingCommand = shellPackage.scripts.package as string;
    const buildIndex = packagingCommand.indexOf('pnpm build');
    const electronBuilderIndex = packagingCommand.indexOf('electron-builder');

    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(electronBuilderIndex).toBeGreaterThan(buildIndex);
  });

  it('wires the actual archive verifier into the Windows afterPack hook', () => {
    const afterPackHook = readFileSync(new URL('../build/verify-packaged-electron.cjs', import.meta.url), 'utf8');

    expect(afterPackHook).toContain('verify-packaged-shell-bootstrap.mjs');
    expect(afterPackHook).toContain('verifyPackagedShellBootstrap({ appOutDir: context.appOutDir })');
  });
});
