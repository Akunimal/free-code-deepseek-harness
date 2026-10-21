import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const launchHidden = vi.hoisted(() => vi.fn());
vi.mock('../src/main/freecode-launcher.js', () => ({ launchHidden }));

import { startPhoenixGateway } from '../src/main/phoenix-gateway.js';

const PINNED_COMMIT = 'e4411650da95edf3002c6789ccd1c816aedae1d4';
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
let root: string;
let children: FakeChild[];
let originalFetch: typeof fetch;

class FakeChild extends EventEmitter {
  pid = 4312;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.killed = true;
    this.signalCode = typeof signal === 'string' ? signal : 'SIGTERM';
    this.emit('exit', null, this.signalCode);
    this.emit('close', null, this.signalCode);
    return true;
  });
}

function makePeX64Console(): Buffer {
  const bytes = Buffer.alloc(512);
  bytes.write('MZ', 0, 'ascii');
  bytes.writeUInt32LE(128, 0x3c);
  bytes.write('PE\0\0', 128, 'ascii');
  bytes.writeUInt16LE(0x8664, 132);
  bytes.writeUInt16LE(0x20b, 152);
  bytes.writeUInt16LE(3, 220);
  return bytes;
}

function makePayload(models = ['auto', 'pollinations/openai-fast']): { resourcesDir: string; executable: string; models: string[] } {
  const resourcesDir = join(root, 'resources', 'freecode');
  const phoenixDir = join(resourcesDir, 'phoenix');
  mkdirSync(phoenixDir, { recursive: true });
  const executable = join(phoenixDir, 'freellmpool-win-x64.exe');
  const binary = makePeX64Console();
  const modelsBytes = `${JSON.stringify(models, null, 2)}\n`;
  const licenseBytes = 'MIT license test fixture\n';
  writeFileSync(executable, binary);
  writeFileSync(join(phoenixDir, 'phoenix-model-ids.json'), modelsBytes);
  writeFileSync(join(phoenixDir, 'LICENSE'), licenseBytes);
  writeFileSync(join(phoenixDir, 'freecode-build-receipt.json'), JSON.stringify({
    schemaVersion: 1,
    upstream: {
      repository: 'https://github.com/0xzr/freellmpool',
      commit: PINNED_COMMIT,
      version: '0.13.0',
      tarballSha256: '31175b80b613386550d247e89546ab312f66bf49950ebdddf3d4ee9e937e6aa6',
    },
    sourceSha256: 'b'.repeat(64),
    binarySha256: sha256(binary),
    modelsCatalogSha256: sha256(modelsBytes),
    licenseSha256: sha256(licenseBytes),
    toolchain: { pythonVersion: '3.14.2', architecture: 'AMD64', pyinstallerVersion: '6.20.0', runtime: { httpx: '0.28.1' } },
  }));
  return { resourcesDir, executable, models };
}

describe('Phoenix desktop gateway', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'freecode-phoenix-main-test-'));
    children = [];
    launchHidden.mockReset().mockImplementation(() => {
      const proc = new FakeChild();
      children.push(proc);
      return { proc, metrics: { id: `test-${children.length}` } };
    });
    originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"status":"ok"}', { status: 200 })));
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
    rmSync(root, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('launches the hash-verified sidecar through freecode-launcher on loopback only', async () => {
    const fixture = makePayload();
    const gateway = await startPhoenixGateway({
      resourcesDir: fixture.resourcesDir,
      userDataDir: join(root, 'profile'),
      platform: 'win32',
      arch: 'x64',
    });

    expect(gateway.modelIds).toEqual(fixture.models);
    expect(gateway.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(launchHidden).toHaveBeenCalledOnce();
    const [launch] = launchHidden.mock.calls[0] as [{ executable: string; args: string[]; env: NodeJS.ProcessEnv }];
    expect(launch.executable).toBe(fixture.executable);
    expect(launch.args).toEqual(['--host', '127.0.0.1', '--port', String(gateway.port), '--state-dir', join(root, 'profile', 'phoenix')]);
    expect(launch.env.FREECODE_PHOENIX_PROXY_KEY).toBe(gateway.apiKey);
    expect(launch.env.OPENAI_API_KEY).toBeUndefined();
    expect(launch.env.FREELLMPOOL_CONFIG_FILE).toBeUndefined();

    await gateway.stop();
    expect(children[0]!.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('fails closed before launch when the staged binary hash is stale', async () => {
    const fixture = makePayload();
    writeFileSync(fixture.executable, Buffer.from('tampered'));
    await expect(startPhoenixGateway({
      resourcesDir: fixture.resourcesDir,
      userDataDir: join(root, 'profile'),
      platform: 'win32',
      arch: 'x64',
    })).rejects.toThrow(/hash|receipt|executable/i);
    expect(launchHidden).not.toHaveBeenCalled();
  });

  it.each([
    'kilo/nvidia/nemotron-3.5-lightning:free',
    'kilo/openrouter/free',
    'kilo/kilo-auto/free',
  ])('fails closed before launch for a forbidden Kilo route: %s', async (model) => {
    const fixture = makePayload(['auto', model]);
    await expect(startPhoenixGateway({
      resourcesDir: fixture.resourcesDir,
      userDataDir: join(root, 'profile'),
      platform: 'win32',
      arch: 'x64',
    })).rejects.toThrow(/model allowlist|Nemotron|dynamic/i);
    expect(launchHidden).not.toHaveBeenCalled();
  });

  it('restarts only its contained child after an unexpected exit, preserving the loopback port', async () => {
    const fixture = makePayload();
    const gateway = await startPhoenixGateway({
      resourcesDir: fixture.resourcesDir,
      userDataDir: join(root, 'profile'),
      platform: 'win32',
      arch: 'x64',
      restartBaseDelayMs: 1,
    });
    children[0]!.exitCode = 1;
    children[0]!.emit('exit', 1, null);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(launchHidden).toHaveBeenCalledTimes(2);
    expect(launchHidden.mock.calls[1]![0].args).toContain(String(gateway.port));
    await gateway.stop();
    expect(children[1]!.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('keeps retrying after a Phoenix restart attempt fails readiness', async () => {
    const fixture = makePayload();
    let healthChecks = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      healthChecks++;
      return new Response('unavailable', { status: healthChecks === 1 ? 200 : 503 });
    }));
    const gateway = await startPhoenixGateway({
      resourcesDir: fixture.resourcesDir,
      userDataDir: join(root, 'profile'),
      platform: 'win32',
      arch: 'x64',
      readyTimeoutMs: 5,
      restartBaseDelayMs: 1,
    });
    children[0]!.exitCode = 1;
    children[0]!.emit('exit', 1, null);
    await new Promise((resolve) => setTimeout(resolve, 650));

    expect(launchHidden.mock.calls.length).toBeGreaterThanOrEqual(3);
    await gateway.stop();
  }, 5_000);

  it('rejects unsupported platforms instead of silently running another gateway', async () => {
    const fixture = makePayload();
    await expect(startPhoenixGateway({
      resourcesDir: fixture.resourcesDir,
      userDataDir: join(root, 'profile'),
      platform: 'linux',
      arch: 'x64',
    })).rejects.toThrow(/Windows x64/i);
    expect(launchHidden).not.toHaveBeenCalled();
  });
});
