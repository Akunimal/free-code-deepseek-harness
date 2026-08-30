import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ensureConfig,
  GeminiWeb2ApiSupervisor,
  resolvePythonCommand,
} from '../src/main/gemini-web2api-supervisor.js';
import { resolveGeminiWeb2ApiDir } from '../src/main/resource-paths.js';

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('gemini-web2api integration', () => {
  it('creates a loopback-only config and preserves user edits', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'freecode-gemini-config-'));
    cleanup.push(dataDir);
    const path = ensureConfig(dataDir, 8765);
    const config = JSON.parse(readFileSync(path, 'utf8'));
    expect(config.port).toBe(8765);
    expect(config.host).toBe('127.0.0.1');
    expect(config.api_keys).toEqual(['freecode-local']);
    expect(config.default_model).toBe('gemini-3.7-flash');
    // User edits to non-patched fields are preserved
    const edited = JSON.stringify({ ...config, proxy: 'http://proxy.test' });
    writeFileSync(path, edited);
    const secondRun = JSON.parse(readFileSync(ensureConfig(dataDir, 9999), 'utf8'));
    expect(secondRun.proxy).toBe('http://proxy.test');
    // But api_keys is always patched to include freecode-local
    expect(secondRun.api_keys).toEqual(['freecode-local']);
  });

  it('resolves the vendored source in development and a Python command', () => {
    const source = resolveGeminiWeb2ApiDir(resolve(process.cwd(), 'resources'));
    expect(readFileSync(join(source, 'gemini_web2api', '__main__.py'), 'utf8')).toContain('def main');
    expect(resolvePythonCommand()).not.toBeNull();
  });

  it('starts the pinned server when Python is available', async () => {
    const probe = createServer();
    await new Promise<void>((resolveListen) => probe.listen(0, '127.0.0.1', resolveListen));
    const address = probe.address();
    const port = address && typeof address !== 'string' ? address.port : 0;
    await new Promise<void>((resolveClose) => probe.close(() => resolveClose()));
    expect(port).toBeGreaterThan(0);

    const dataDir = mkdtempSync(join(tmpdir(), 'freecode-gemini-supervisor-'));
    cleanup.push(dataDir);
    const supervisor = new GeminiWeb2ApiSupervisor({
      resourcesDir: resolve(process.cwd(), 'resources'),
      userDataDir: dataDir,
      port,
      startupTimeoutMs: 8_000,
      healthTimeoutMs: 300,
    });
    const result = await supervisor.start();
    expect(result.available).toBe(true);
    expect(result.baseUrl).toBe(`http://127.0.0.1:${port}`);
    expect(readFileSync(join(dataDir, 'gemini-web2api', 'config.json'), 'utf8')).toContain('freecode-local');
    const models = await fetch(`${result.baseUrl}/v1/models`, {
      headers: { Authorization: 'Bearer freecode-local' },
    });
    expect(models.status).toBe(200);
    const modelList = (await models.json()) as { data?: unknown[] };
    expect(modelList.data?.length).toBeGreaterThan(0);
    await supervisor.stop();
  }, 20_000);
});
