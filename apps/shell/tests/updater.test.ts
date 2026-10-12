import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { checkUpstreamUpdate, createUpdateService, isNewerVersion, resolveUpdaterAdapter, type UpdaterAdapter } from '../src/main/updater.js';
import { checkHarnessRelease, harnessAssetName, installHarnessRuntime, resolveTarExecutable } from '../src/main/harness-updater.js';

function writeValidHarnessRuntime(
  root: string,
  version: string,
  cliContents: string,
  nodeEngine = '^22.19.0 || >=24.0.0',
  nodeModuleVersion = process.versions.modules,
): void {
  const dsh = join(root, 'dsh');
  mkdirSync(join(dsh, 'apps', 'cli', 'lib'), { recursive: true });
  writeFileSync(join(dsh, 'apps', 'cli', 'lib', 'bin.js'), cliContents);
  mkdirSync(join(dsh, 'packages'), { recursive: true });
  writeFileSync(join(dsh, 'packages', 'core'), 'fixture');
  const bridgeDir = join(dsh, 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib');
  mkdirSync(bridgeDir, { recursive: true });
  writeFileSync(join(bridgeDir, 'index.js'), [
    'FREECODE_DIALOG_BRIDGE_ENDPOINT',
    'FREECODE_DIALOG_BRIDGE_TOKEN',
    'x-freecode-dialog-token',
    'fetch(',
  ].join('\n'));
  writeFileSync(join(dsh, 'package.json'), JSON.stringify({ engines: { node: nodeEngine } }));
  writeFileSync(join(root, 'runtime-manifest.json'), JSON.stringify({
    version,
    nodeModuleVersion,
    cli: 'dsh/apps/cli/lib/bin.js',
  }));
}

function createHarnessArchive(archivePath: string, archiveRoot: string): Buffer {
  const result = spawnSync(resolveTarExecutable(), ['-czf', archivePath, '-C', archiveRoot, 'dsh', 'runtime-manifest.json'], { windowsHide: true });
  if (result.status !== 0) throw new Error(`fixture tar failed: ${String(result.status)}`);
  return readFileSync(archivePath);
}

describe('update service', () => {
  it('only treats a strictly newer release as available', () => {
    expect(isNewerVersion('0.2.2', '0.2.2')).toBe(false);
    expect(isNewerVersion('0.2.2', '0.2.3')).toBe(true);
    expect(isNewerVersion('0.2.2', '0.2.1')).toBe(false);
    expect(isNewerVersion('0.2.2-beta.2', '0.2.2-beta.10')).toBe(true);
    expect(isNewerVersion('0.2.2-beta.2', '0.2.2')).toBe(true);
  });

  it('resolves electron-updater from both CommonJS interop shapes', () => {
    const adapter = { autoDownload: false, autoInstallOnAppQuit: false, checkForUpdates: vi.fn(), quitAndInstall: vi.fn() } as UpdaterAdapter;
    expect(resolveUpdaterAdapter({ default: { autoUpdater: adapter } })).toBe(adapter);
    expect(resolveUpdaterAdapter({ autoUpdater: adapter })).toBe(adapter);
  });

  it('is disabled by default and never invokes an adapter', async () => {
    const adapter = { checkForUpdates: vi.fn(), quitAndInstall: vi.fn() } as unknown as UpdaterAdapter;
    const service = createUpdateService({ adapter });
    expect(service.enabled).toBe(false);
    expect(await service.check()).toEqual({ status: 'disabled' });
    service.install();
    expect(adapter.checkForUpdates).not.toHaveBeenCalled();
    expect(adapter.quitAndInstall).not.toHaveBeenCalled();
  });

  it('checks without auto-downloading and reports update metadata', async () => {
    const adapter: UpdaterAdapter = {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.2.0' } })),
      downloadUpdate: vi.fn(async () => undefined),
      quitAndInstall: vi.fn(),
    };
    const service = createUpdateService({ enabled: true, adapter });
    await expect(service.check()).resolves.toEqual({ status: 'checked', info: { version: '0.2.0' } });
    expect(adapter.autoDownload).toBe(false);
    expect(adapter.autoInstallOnAppQuit).toBe(true);
    service.install();
    expect(adapter.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight check so concurrent callers cannot use stale update state', async () => {
    let releaseCheck!: (value: { updateInfo: { version: string } }) => void;
    const checkForUpdates = vi.fn(() => new Promise<{ updateInfo: { version: string } }>((resolve) => {
      releaseCheck = resolve;
    }));
    const adapter: UpdaterAdapter = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates,
      downloadUpdate: vi.fn(async () => undefined),
      quitAndInstall: vi.fn(),
    };
    const service = createUpdateService({ enabled: true, adapter });
    const first = service.check();
    const second = service.check();
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    releaseCheck({ updateInfo: { version: '0.2.2' } });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'checked', info: { version: '0.2.2' }, upstream: undefined },
      { status: 'checked', info: { version: '0.2.2' }, upstream: undefined },
    ]);
  });

  it('downloads a confirmed release before asking electron to install it', async () => {
    const adapter: UpdaterAdapter = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.2.0' } })),
      downloadUpdate: vi.fn(async () => undefined),
      quitAndInstall: vi.fn(),
    };
    const service = createUpdateService({ enabled: true, adapter });
    await expect(service.downloadAndInstall()).resolves.toEqual({ status: 'installed' });
    expect(adapter.autoDownload).toBe(false);
    expect(adapter.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(adapter.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('refuses to install when the updater cannot download the confirmed release', async () => {
    const adapter = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.6.0' } })),
      quitAndInstall: vi.fn(),
    } as UpdaterAdapter;
    const service = createUpdateService({ enabled: true, adapter });
    await expect(service.downloadAndInstall()).resolves.toMatchObject({
      status: 'failed',
      error: expect.stringContaining('downloadUpdate'),
    });
    expect(adapter.quitAndInstall).not.toHaveBeenCalled();
  });

  it('detects a newer upstream commit without downloading a release', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ sha: 'new-upstream-sha' }), { status: 200 }));
    await expect(checkUpstreamUpdate('old-upstream-sha', fetchImpl)).resolves.toMatchObject({
      currentCommit: 'old-upstream-sha',
      latestCommit: 'new-upstream-sha',
      available: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/deepseek-ai/deepseek-harness/commits/main',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('selects a platform-specific Harness runtime asset', async () => {
    const assetName = harnessAssetName('0.1.8', 'win32', 'x64');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{
      tag_name: 'v0.1.8',
      assets: [{ name: assetName, browser_download_url: `https://example.test/${assetName}`, digest: 'sha256:abc' }],
    }]), { status: 200 }));
    await expect(checkHarnessRelease('0.1.7', 'win32', 'x64', fetchImpl)).resolves.toMatchObject({
      latestVersion: '0.1.8',
      assetName,
      assetUrl: `https://example.test/${assetName}`,
      available: true,
    });
  });

  it('makes the latest compatible runtime available when no runtime is installed yet', async () => {
    const assetName = harnessAssetName('0.1.8', 'win32', 'x64');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{
      tag_name: 'v0.1.8',
      assets: [{ name: assetName, browser_download_url: `https://example.test/${assetName}`, digest: 'sha256:abc' }],
    }]), { status: 200 }));

    await expect(checkHarnessRelease(undefined, 'win32', 'x64', fetchImpl)).resolves.toMatchObject({
      latestVersion: '0.1.8',
      assetName,
      available: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/Akunimal/free-code-deepseek-harness/releases?per_page=100',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('does not offer an older published runtime as an update', async () => {
    const currentVersion = '0.2.1-alpha.2';
    const olderAssetName = harnessAssetName('0.2.1-alpha.1', 'win32', 'x64');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{
      tag_name: 'v0.9.0',
      prerelease: true,
      assets: [{ name: olderAssetName, browser_download_url: `https://example.test/${olderAssetName}` }],
    }]), { status: 200 }));

    await expect(checkHarnessRelease(currentVersion, 'win32', 'x64', fetchImpl)).resolves.toMatchObject({
      currentVersion,
      latestVersion: '0.2.1-alpha.1',
      assetName: olderAssetName,
      available: false,
    });
  });

  it('selects the exact packaged DSH prerelease instead of stale or newer release assets', async () => {
    const staleAssetName = harnessAssetName('0.1.3-alpha.1', 'win32', 'x64');
    const compatibleAssetName = harnessAssetName('0.2.1-alpha.2', 'win32', 'x64');
    const newerAssetName = harnessAssetName('0.3.0-alpha.1', 'win32', 'x64');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([
      {
        tag_name: 'v0.9.2',
        prerelease: false,
        assets: [{ name: staleAssetName, browser_download_url: `https://example.test/${staleAssetName}`, digest: 'sha256:old' }],
      },
      {
        tag_name: 'v0.2.1-alpha.2',
        prerelease: true,
        assets: [{ name: compatibleAssetName, browser_download_url: `https://example.test/${compatibleAssetName}`, digest: 'sha256:new' }],
      },
      {
        tag_name: 'v0.3.0-alpha.1',
        prerelease: true,
        assets: [{ name: newerAssetName, browser_download_url: `https://example.test/${newerAssetName}`, digest: 'sha256:unmatched' }],
      },
    ]), { status: 200 }));

    await expect(checkHarnessRelease(undefined, 'win32', 'x64', fetchImpl, undefined, '0.2.1-alpha.2')).resolves.toMatchObject({
      latestVersion: '0.2.1-alpha.2',
      assetName: compatibleAssetName,
      assetUrl: `https://example.test/${compatibleAssetName}`,
      digest: 'sha256:new',
      available: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/Akunimal/free-code-deepseek-harness/releases?per_page=100',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('does not fall back to another DSH version when the packaged runtime asset is missing', async () => {
    const newerAssetName = harnessAssetName('0.3.0-alpha.1', 'win32', 'x64');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{
      tag_name: 'v0.3.0-alpha.1',
      prerelease: true,
      assets: [{ name: newerAssetName, browser_download_url: `https://example.test/${newerAssetName}`, digest: 'sha256:newer' }],
    }]), { status: 200 }));

    await expect(checkHarnessRelease(undefined, 'win32', 'x64', fetchImpl, undefined, '0.2.1-alpha.2')).resolves.toMatchObject({
      available: false,
      error: 'No harness runtime asset for packaged version 0.2.1-alpha.2 (win32-x64)',
    });
  });

  it('uses the Harness asset version when the app release tag has a different version', async () => {
    const assetName = harnessAssetName('0.1.1-rc.2', 'win32', 'x64');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{
      tag_name: 'v0.1.7',
      assets: [{ name: assetName, browser_download_url: `https://example.test/${assetName}` }],
    }]), { status: 200 }));
    await expect(checkHarnessRelease('0.1.0', 'win32', 'x64', fetchImpl)).resolves.toMatchObject({
      latestVersion: '0.1.1-rc.2',
      assetName,
      available: true,
    });
  });

  it('installs a Harness-only update through its dedicated adapter', async () => {
    const install = vi.fn(async () => undefined);
    const service = createUpdateService({
      enabled: true,
      harness: { check: vi.fn(), downloadAndInstall: install },
    });
    const info = { currentVersion: '0.1.7', latestVersion: '0.1.8', available: true };
    await expect(service.installHarness(info)).resolves.toEqual({ status: 'installed' });
    expect(install).toHaveBeenCalledWith(info);
  });

  it('pins System32 bsdtar on Windows instead of a PATH-resolved msys tar', () => {
    // msys GNU tar (Git-for-Windows) misparses native D:\ paths as remote
    // host:file tapes, which breaks both fixture creation and production
    // extraction on dev machines.
    expect(resolveTarExecutable('win32')).toMatch(/System32[\\/]tar\.exe$/i);
    expect(resolveTarExecutable('linux')).toBe('tar');
    expect(resolveTarExecutable('darwin')).toBe('tar');
  });

  it('atomically installs the Harness and its runtime manifest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-test-'));
    try {
      const resources = join(root, 'resources');
      const archiveRoot = join(root, 'archive-root');
      const archivePath = join(root, 'harness.tar.gz');
      for (const base of [resources, archiveRoot]) mkdirSync(base, { recursive: true });
      writeValidHarnessRuntime(resources, '0.1.7', 'old');
      writeValidHarnessRuntime(archiveRoot, '0.1.8', 'new');
      // Build the fixture with the same tar the production extractor uses:
      // a PATH-resolved GNU tar misparses native D:\ paths as remote tapes.
      const bytes = createHarnessArchive(archivePath, archiveRoot);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const onProgress = vi.fn();

      await installHarnessRuntime(
        { currentVersion: '0.1.7', latestVersion: '0.1.8', assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.1.8/harness.tar.gz', digest: `sha256:${digest}`, available: true },
        resources,
        vi.fn(async () => new Response(new Uint8Array(bytes), { status: 200 })),
        onProgress,
      );

      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).toBe('new');
      expect(JSON.parse(readFileSync(join(resources, 'runtime-manifest.json'), 'utf8')).version).toBe('0.1.8');
      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).not.toBe('old');
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'download', receivedBytes: bytes.length }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('installs a validated runtime when the user-data target is initially empty', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-first-run-'));
    try {
      const resources = join(root, 'user-data', 'harness-runtime');
      const archiveRoot = join(root, 'archive-root');
      const archivePath = join(root, 'harness.tar.gz');
      mkdirSync(archiveRoot, { recursive: true });
      writeValidHarnessRuntime(archiveRoot, '0.1.8', 'first-run');
      const bytes = createHarnessArchive(archivePath, archiveRoot);
      const digest = createHash('sha256').update(bytes).digest('hex');

      await expect(installHarnessRuntime({
        latestVersion: '0.1.8',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.1.8/harness.tar.gz',
        digest: `sha256:${digest}`,
        available: true,
      }, resources, vi.fn(async () => new Response(new Uint8Array(bytes), { status: 200 })))).resolves.toBeUndefined();

      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).toBe('first-run');
      expect(JSON.parse(readFileSync(join(resources, 'runtime-manifest.json'), 'utf8')).version).toBe('0.1.8');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not promote an archive whose native ABI differs from Electron', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-abi-reject-'));
    try {
      const resources = join(root, 'resources');
      const archiveRoot = join(root, 'archive-root');
      const archivePath = join(root, 'harness.tar.gz');
      mkdirSync(resources, { recursive: true });
      mkdirSync(archiveRoot, { recursive: true });
      writeValidHarnessRuntime(resources, '0.2.0', 'last-known-good');
      writeValidHarnessRuntime(archiveRoot, '0.2.1-alpha.2', 'wrong-abi', '^22.19.0 || >=24.0.0', '133');
      const bytes = createHarnessArchive(archivePath, archiveRoot);
      const digest = createHash('sha256').update(bytes).digest('hex');

      await expect(installHarnessRuntime({
        latestVersion: '0.2.1-alpha.2',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.2.1-alpha.2/harness.tar.gz',
        digest: `sha256:${digest}`,
        available: true,
      }, resources, vi.fn(async () => new Response(new Uint8Array(bytes), { status: 200 })), undefined, {}, {
        minimumVersion: '0.2.1-alpha.2',
        nodeModuleVersion: process.versions.modules,
      })).rejects.toThrow(new RegExp(`133.*NODE_MODULE_VERSION ${process.versions.modules}`));

      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).toBe('last-known-good');
      expect(JSON.parse(readFileSync(join(resources, 'runtime-manifest.json'), 'utf8')).version).toBe('0.2.0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps a first-run runtime download alive while bytes continue arriving past the idle timeout', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-slow-stream-'));
    const resources = join(root, 'user-data', 'harness-runtime');
    const archiveRoot = join(root, 'archive-root');
    const archivePath = join(root, 'harness.tar.gz');
    mkdirSync(resources, { recursive: true });
    mkdirSync(archiveRoot, { recursive: true });
    writeValidHarnessRuntime(resources, '0.1.7', 'old');
    writeValidHarnessRuntime(archiveRoot, '0.1.8', 'slow-stream');
    const bytes = createHarnessArchive(archivePath, archiveRoot);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const chunkSize = Math.ceil(bytes.length / 24);
    const chunkCount = Math.ceil(bytes.length / chunkSize);
    expect(chunkCount * 20).toBeGreaterThan(250);

    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      throw new Error('the asset body must not use an absolute timeout');
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let offset = 0;
        const emit = () => {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          const end = Math.min(offset + chunkSize, bytes.length);
          controller.enqueue(new Uint8Array(bytes.subarray(offset, end)));
          offset = end;
          setTimeout(emit, 20);
        };
        setTimeout(emit, 20);
      },
    });

    try {
      await expect(installHarnessRuntime({
        latestVersion: '0.1.8',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.1.8/harness.tar.gz',
        digest: `sha256:${digest}`,
        available: true,
      }, resources, vi.fn(async () => new Response(body, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })), undefined, { responseTimeoutMs: 1_000, idleTimeoutMs: 250 })).resolves.toBeUndefined();

      expect(timeoutSpy).not.toHaveBeenCalled();
      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).toBe('slow-stream');
      expect(JSON.parse(readFileSync(join(resources, 'runtime-manifest.json'), 'utf8')).version).toBe('0.1.8');
    } finally {
      timeoutSpy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('times out a stalled runtime stream by inactivity and preserves the working runtime', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-stalled-stream-'));
    const resources = join(root, 'user-data', 'harness-runtime');
    mkdirSync(resources, { recursive: true });
    writeValidHarnessRuntime(resources, '0.1.7', 'working');
    const legacyTimeout = new AbortController();
    legacyTimeout.abort(new DOMException('legacy absolute timeout', 'TimeoutError'));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(legacyTimeout.signal);
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 });
    });

    try {
      await expect(installHarnessRuntime({
        latestVersion: '0.1.8',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.1.8/harness.tar.gz',
        digest: `sha256:${'0'.repeat(64)}`,
        available: true,
      }, resources, fetchImpl, undefined, { responseTimeoutMs: 500, idleTimeoutMs: 25 })).rejects.toThrow(
        /Harness download stalled: no data received for 25 ms/,
      );

      expect(timeoutSpy).not.toHaveBeenCalled();
      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).toBe('working');
      expect(JSON.parse(readFileSync(join(resources, 'runtime-manifest.json'), 'utf8')).version).toBe('0.1.7');
    } finally {
      timeoutSpy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('times out if the runtime asset never returns response headers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-response-timeout-'));
    const resources = join(root, 'user-data', 'harness-runtime');
    const legacyTimeout = new AbortController();
    legacyTimeout.abort(new DOMException('legacy absolute timeout', 'TimeoutError'));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(legacyTimeout.signal);
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('missing request signal'));
        return;
      }
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));

    try {
      await expect(installHarnessRuntime({
        latestVersion: '0.1.8',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.1.8/harness.tar.gz',
        digest: `sha256:${'0'.repeat(64)}`,
        available: true,
      }, resources, fetchImpl, undefined, { responseTimeoutMs: 25, idleTimeoutMs: 50 })).rejects.toThrow(
        /Timed out waiting 25 ms for the harness download response/,
      );

      expect(timeoutSpy).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      timeoutSpy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an incompatible downloaded Node engine before replacing the working runtime', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-incompatible-node-'));
    try {
      const resources = join(root, 'user-data', 'harness-runtime');
      const archiveRoot = join(root, 'archive-root');
      const archivePath = join(root, 'harness.tar.gz');
      mkdirSync(resources, { recursive: true });
      mkdirSync(archiveRoot, { recursive: true });
      writeValidHarnessRuntime(resources, '0.1.7', 'working');
      writeValidHarnessRuntime(archiveRoot, '0.1.8', 'incompatible', '>=25.0.0');
      const bytes = createHarnessArchive(archivePath, archiveRoot);
      const digest = createHash('sha256').update(bytes).digest('hex');

      await expect(installHarnessRuntime({
        latestVersion: '0.1.8',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.1.8/harness.tar.gz',
        digest: `sha256:${digest}`,
        available: true,
      }, resources, vi.fn(async () => new Response(new Uint8Array(bytes), { status: 200 })))).rejects.toThrow(
        /does not satisfy DSH engines\.node >=25\.0\.0/,
      );

      expect(readFileSync(join(resources, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), 'utf8')).toBe('working');
      expect(JSON.parse(readFileSync(join(resources, 'runtime-manifest.json'), 'utf8')).version).toBe('0.1.7');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a runtime asset without a release checksum', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-updater-missing-digest-'));
    try {
      const resources = join(root, 'user-data', 'harness-runtime');
      await expect(installHarnessRuntime({
        latestVersion: '0.1.8',
        assetUrl: 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.1.8/harness.tar.gz',
        available: true,
      }, resources, vi.fn())).rejects.toThrow(/SHA-256 digest/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns upstream status even if a release check is unavailable', async () => {
    const adapter: UpdaterAdapter = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn(async () => { throw new Error('offline'); }),
      quitAndInstall: vi.fn(),
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ sha: 'new-sha' }), { status: 200 }));
    const service = createUpdateService({ enabled: true, adapter, upstreamCommit: 'old-sha', fetchImpl });
    await expect(service.check()).resolves.toMatchObject({
      status: 'failed',
      upstream: { available: true, latestCommit: 'new-sha' },
    });
  });
});
