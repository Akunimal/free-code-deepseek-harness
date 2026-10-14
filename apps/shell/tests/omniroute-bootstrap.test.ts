import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureOmniRouteRuntime, OmniRouteBootstrap } from '../src/main/omniroute-bootstrap.js';
import { resolveTarExecutable } from '../src/main/harness-updater.js';

const roots: string[] = [];
const assetUrl = 'https://github.com/Akunimal/free-code-deepseek-harness/releases/download/v0.9.4/omniroute-runtime-3.8.51.tar.gz';

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('first-launch OmniRoute runtime bootstrap', () => {
  it('retries optional preparation after a failure without creating a second concurrent download', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-class-retry-'));
    roots.push(root);
    const archive = createArchive(root, 'retry');
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockImplementation(async () => new Response(new Uint8Array(archive), { status: 200 }));
    const bootstrap = new OmniRouteBootstrap({ descriptorPath: writeDescriptor(root, archive), userDataDir: join(root, 'data'), fetchImpl });
    await expect(bootstrap.prepare()).rejects.toThrow('503');
    const retried = bootstrap.prepare();
    expect(bootstrap.prepare()).toBe(retried);
    await retried;
    expect(bootstrap.state.status).toBe('ready');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await bootstrap.stop();
  });
  it('keeps preparation optional/nonblocking and cancels only its own download on stop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-background-'));
    roots.push(root);
    const descriptorPath = writeDescriptor(root, createArchive(root, 'background'));
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream<Uint8Array>(), { status: 200 }));
    const bootstrap = new OmniRouteBootstrap({ descriptorPath, userDataDir: join(root, 'user-data'), fetchImpl });
    const prepared = bootstrap.prepare();
    const outcome = prepared.catch(error => error);
    expect(bootstrap.state.status).toBe('preparing');
    await new Promise(resolve => setTimeout(resolve, 10));
    await bootstrap.stop();
    expect(await outcome).toBeInstanceOf(Error);
    expect(bootstrap.state.status).toBe('unavailable');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed download and preserves a working cache on a failed replacement', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-retry-'));
    roots.push(root);
    const archive = createArchive(root, 'preserved-cache');
    const descriptorPath = writeDescriptor(root, archive);
    const userDataDir = join(root, 'user-data');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockImplementation(async () => new Response(new Uint8Array(archive), { status: 200 }));
    const options = { descriptorPath, userDataDir, fetchImpl };
    await expect(ensureOmniRouteRuntime(options)).rejects.toThrow(/HTTP 503/);
    await expect(ensureOmniRouteRuntime(options)).resolves.toMatchObject({ source: 'downloaded' });
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
    writeFileSync(descriptorPath, JSON.stringify({ ...descriptor, sha256: 'f'.repeat(64) }));
    await expect(ensureOmniRouteRuntime(options)).rejects.toThrow(/SHA-256/);
    expect(readFileSync(join(userDataDir, 'omniroute-runtime', 'node_modules', 'omniroute', 'dist', 'server.js'), 'utf8'))
      .toContain('preserved-cache');
  });

  it('bounds stalled response bodies and honors caller cancellation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-stall-'));
    roots.push(root);
    const archive = createArchive(root, 'stalled');
    const descriptorPath = writeDescriptor(root, archive);
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream<Uint8Array>(), { status: 200 }));
    await expect(ensureOmniRouteRuntime({ descriptorPath, userDataDir: join(root, 'stall'), fetchImpl, idleTimeoutMs: 30 }))
      .rejects.toThrow(/timed out/);
    const controller = new AbortController();
    controller.abort(new Error('test cancelled'));
    await expect(ensureOmniRouteRuntime({ descriptorPath, userDataDir: join(root, 'cancel'), fetchImpl, signal: controller.signal }))
      .rejects.toThrow('test cancelled');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('downloads once, verifies and atomically installs the pinned runtime in per-user data', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-bootstrap-'));
    roots.push(root);
    const archiveBytes = createArchive(root, 'first-run');
    const descriptorPath = writeDescriptor(root, archiveBytes);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(assetUrl);
      return new Response(new Uint8Array(archiveBytes), { status: 200 });
    });
    const onProgress = vi.fn();
    const options = {
      descriptorPath,
      userDataDir: join(root, 'user-data'),
      fetchImpl,
      onProgress,
    };

    await expect(ensureOmniRouteRuntime(options)).resolves.toMatchObject({
      status: 'ready',
      source: 'downloaded',
      version: '3.8.51',
      runtimeDir: join(root, 'user-data', 'omniroute-runtime'),
    });
    expect(readFileSync(join(options.userDataDir, 'omniroute-runtime', 'node_modules', 'omniroute', 'dist', 'server.js'), 'utf8'))
      .toContain('first-run');
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'download' }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'extract' }));

    await expect(ensureOmniRouteRuntime(options)).resolves.toMatchObject({ source: 'existing', version: '3.8.51' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('coalesces simultaneous first-start checks into one download and install', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-bootstrap-race-'));
    roots.push(root);
    const archiveBytes = createArchive(root, 'shared-first-run');
    const descriptorPath = writeDescriptor(root, archiveBytes);
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(archiveBytes), { status: 200 }));
    const options = { descriptorPath, userDataDir: join(root, 'user-data'), fetchImpl };

    const results = await Promise.all([
      ensureOmniRouteRuntime(options),
      ensureOmniRouteRuntime(options),
    ]);

    expect(results.map(result => result.source)).toEqual(['downloaded', 'downloaded']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a digest mismatch without leaving a partial runtime behind', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-bootstrap-bad-digest-'));
    roots.push(root);
    const archiveBytes = createArchive(root, 'tampered');
    const descriptorPath = writeDescriptor(root, archiveBytes, { sha256: '0'.repeat(64) });
    const userDataDir = join(root, 'user-data');

    await expect(ensureOmniRouteRuntime({
      descriptorPath,
      userDataDir,
      fetchImpl: vi.fn(async () => new Response(new Uint8Array(archiveBytes), { status: 200 })),
    })).rejects.toThrow(/SHA-256/);
    expect(() => readFileSync(join(userDataDir, 'omniroute-runtime', 'runtime-manifest.json'))).toThrow();
  });

  it('fails closed on an unpinned URL or a runtime whose internal version disagrees', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-omniroute-bootstrap-contract-'));
    roots.push(root);

    const validBytes = createArchive(root, 'wrong-version', '3.8.50');
    const wrongVersionDescriptor = writeDescriptor(root, validBytes);
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(validBytes), { status: 200 }));
    await expect(ensureOmniRouteRuntime({
      descriptorPath: wrongVersionDescriptor,
      userDataDir: join(root, 'wrong-version-data'),
      fetchImpl,
    })).rejects.toThrow(/version/i);

    const goodBytes = createArchive(root, 'url-test');
    const badUrlDescriptor = writeDescriptor(root, goodBytes, {
      assetUrl: 'https://registry.npmjs.org/omniroute/-/omniroute-3.8.51.tgz',
    });
    await expect(ensureOmniRouteRuntime({
      descriptorPath: badUrlDescriptor,
      userDataDir: join(root, 'bad-url-data'),
      fetchImpl,
    })).rejects.toThrow(/URL/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

function createArchive(root: string, serverText: string, version = '3.8.51'): Buffer {
  const runtimeRoot = join(root, 'runtime-source');
  const omniRoot = join(runtimeRoot, 'node_modules', 'omniroute');
  mkdirSync(join(omniRoot, 'dist'), { recursive: true });
  writeFileSync(join(omniRoot, 'package.json'), JSON.stringify({
    name: 'omniroute',
    version,
    engines: { node: '>=22.22.2 <23 || >=24.0.0 <27' },
    dependencies: {},
  }), 'utf8');
  writeFileSync(join(omniRoot, 'dist', 'server.js'), `// ${serverText}`, 'utf8');
  writeFileSync(join(runtimeRoot, 'runtime-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    version,
    entry: 'node_modules/omniroute/dist/server.js',
    engines: { node: '>=22.22.2 <23 || >=24.0.0 <27' },
    lockfileSha256: 'a'.repeat(64),
  }), 'utf8');
  const archivePath = join(root, 'test-omniroute-runtime.tar.gz');
  const tar = spawnSync(resolveTarExecutable(), [
    '-czf', archivePath, '--format=pax', '-C', runtimeRoot, 'runtime-manifest.json', 'node_modules',
  ], { encoding: 'utf8', windowsHide: true });
  if (tar.status !== 0) throw new Error(`test tar failed: ${tar.stderr}`);
  return readFileSync(archivePath);
}

function writeDescriptor(root: string, archive: Buffer, overrides: Record<string, unknown> = {}): string {
  const path = join(root, `descriptor-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    appVersion: '0.9.4',
    version: '3.8.51',
    platform: 'any',
    assetName: 'omniroute-runtime-3.8.51.tar.gz',
    assetUrl,
    sha256: createHash('sha256').update(archive).digest('hex'),
    sizeBytes: archive.length,
    entry: 'node_modules/omniroute/dist/server.js',
    ...overrides,
  }, null, 2), 'utf8');
  return path;
}
