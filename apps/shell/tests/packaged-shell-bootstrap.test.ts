import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];
const packagedMainPath = join('dist', 'src', 'main', 'index.js');
const packagedIndicatorPath = join('dist', 'src', 'main', 'update-indicator-html.js');
const circularIndicatorSource = 'button{-webkit-appearance:none;appearance:none;width:34px;height:34px;padding:0;border-radius:50%}';
const shellRequire = createRequire(new URL('../package.json', import.meta.url));
const builderRequire = createRequire(shellRequire.resolve('electron-builder/package.json'));
const asar = builderRequire('@electron/asar') as {
  createPackage(sourceDir: string, archivePath: string): Promise<unknown>;
  extractFile(archivePath: string, filePath: string): Buffer;
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

async function waitForAsarEntry(archivePath: string, entryPath: string, expected: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (asar.extractFile(archivePath, entryPath).toString('utf8') === expected) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`ASAR fixture entry ${entryPath} did not finish writing${detail}`);
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
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir, staticResourcesDir) {',
      "  const requirements = readHarnessRuntimeRequirements(join(staticResourcesDir, 'runtime-manifest.json'));",
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir, requirements });',
      '}',
      "updateIndicatorView.setBackgroundColor('#00000000');",
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir, resources))) return;',
      'await awaitHarnessLayout({ resourcesDir });',
    ].join('\n');
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    const extractFile = (_archivePath: string, filePath: string) =>
      filePath === packagedIndicatorPath ? circularIndicatorSource : bundledMain;

    expect(verifyPackagedShellBootstrap({ ...paths, extractFile }))
      .toMatchObject({ ok: true });
  });

  it('rejects an opaque native backing surface for the circular update indicator', async () => {
    const paths = fixture();
    const bundledMain = [
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir, staticResourcesDir) {',
      "  const requirements = readHarnessRuntimeRequirements(join(staticResourcesDir, 'runtime-manifest.json'));",
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir, requirements });',
      '}',
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir, resources))) return;',
      'await awaitHarnessLayout({ resourcesDir });',
    ].join('\n');
    const extractFile = (_archivePath: string, filePath: string) =>
      filePath === packagedIndicatorPath ? circularIndicatorSource : bundledMain;
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    const result = verifyPackagedShellBootstrap({ ...paths, extractFile });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/transparent.*native.*surface/i);
  });

  it('rejects a packaged update indicator that does not reset and round the circular button', async () => {
    const paths = fixture();
    const bundledMain = [
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir, staticResourcesDir) {',
      "  const requirements = readHarnessRuntimeRequirements(join(staticResourcesDir, 'runtime-manifest.json'));",
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir, requirements });',
      '}',
      "updateIndicatorView.setBackgroundColor('#00000000');",
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir, resources))) return;',
      'await awaitHarnessLayout({ resourcesDir });',
    ].join('\n');
    const extractFile = (_archivePath: string, filePath: string) =>
      filePath === packagedIndicatorPath ? 'button{border-radius:4px}' : bundledMain;
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    const result = verifyPackagedShellBootstrap({ ...paths, extractFile });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/circular update indicator/);
  });

  it('rejects a packaged bootstrap that omits the runtime version and native ABI requirements', async () => {
    const paths = fixture();
    const bundledMain = [
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir, staticResourcesDir) {',
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir });',
      '}',
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir, resources))) return;',
      'await awaitHarnessLayout({ resourcesDir });',
    ].join('\n');
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    const result = verifyPackagedShellBootstrap({ ...paths, extractFile: () => bundledMain });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/compatibility requirements check/);
  });

  it('extracts the main entry from a real app.asar using the host archive path format', async () => {
    const paths = fixture();
    const sourceRoot = join(paths.appOutDir, 'stage');
    const mainPath = join(sourceRoot, packagedMainPath);
    const indicatorPath = join(sourceRoot, packagedIndicatorPath);
    const bundledMain = [
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir, staticResourcesDir) {',
      "  const requirements = readHarnessRuntimeRequirements(join(staticResourcesDir, 'runtime-manifest.json'));",
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir, requirements });',
      '}',
      "updateIndicatorView.setBackgroundColor('#00000000');",
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir, resources))) return;',
      'await awaitHarnessLayout({ resourcesDir });',
    ].join('\n');
    mkdirSync(join(sourceRoot, 'dist', 'src', 'main'), { recursive: true });
    writeFileSync(mainPath, bundledMain);
    writeFileSync(indicatorPath, circularIndicatorSource);
    rmSync(paths.archivePath);
    await asar.createPackage(sourceRoot, paths.archivePath);
    // @electron/asar can resolve createPackage before its destination stream is
    // fully flushed; wait for the exact fixture bytes before testing extraction.
    await waitForAsarEntry(paths.archivePath, packagedIndicatorPath, circularIndicatorSource);
    const { verifyPackagedShellBootstrap } = await loadVerifier();

    const result = verifyPackagedShellBootstrap({ appOutDir: paths.appOutDir });
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ ok: true, entryPath: packagedMainPath });
  });

  it('rejects a bootstrap call placed after DSH preflight', async () => {
    const paths = fixture();
    const bundledMain = [
      'async function ensurePackagedHarnessRuntime(harnessRuntimeDir, staticResourcesDir) {',
      "  const requirements = readHarnessRuntimeRequirements(join(staticResourcesDir, 'runtime-manifest.json'));",
      '  await ensureHarnessRuntime({ resourcesDir: harnessRuntimeDir, requirements });',
      '}',
      'await awaitHarnessLayout({ resourcesDir });',
      'if (app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir, resources))) return;',
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
    const scripts = shellPackage.scripts as Record<string, string>;
    const desktopWorkflow = scripts['package:desktop'] ?? '';
    const preflightIndex = desktopWorkflow.indexOf('pnpm prepackage:verify');
    const buildIndex = desktopWorkflow.indexOf('pnpm build');
    const packagerIndex = desktopWorkflow.indexOf('node ../../scripts/package-desktop.mjs');
    const packageDesktop = readFileSync(new URL('../../../scripts/package-desktop.mjs', import.meta.url), 'utf8');

    expect(scripts.package).toBe('pnpm package:desktop');
    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(preflightIndex);
    expect(packagerIndex).toBeGreaterThan(buildIndex);
    expect(packageDesktop).toContain("requireFromShell.resolve('electron-builder/cli.js')");
    expect(packageDesktop).toContain('spawnSync(process.execPath, args');
  });

  it('wires the actual archive verifier into the Windows afterPack hook', () => {
    const afterPackHook = readFileSync(new URL('../build/verify-packaged-electron.cjs', import.meta.url), 'utf8');

    expect(afterPackHook).toContain('verify-packaged-shell-bootstrap.mjs');
    expect(afterPackHook).toContain('verifyPackagedShellBootstrap({ appOutDir: context.appOutDir })');
  });
});
