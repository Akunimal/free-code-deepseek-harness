import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nodeRuntimeEnv, resolveNodePath, resolveOpencodeBinary, resolveResourcesDir } from '../src/main/resource-paths.js';

describe('resource-paths', () => {
  it('uses the packaged freecode directory when present', () => {
    const base = mkdtempSync(join(tmpdir(), 'freecode-resources-'));
    try {
      mkdirSync(join(base, 'freecode'), { recursive: true });
      expect(resolveResourcesDir({ packaged: true, resourcesPath: base })).toBe(join(base, 'freecode'));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('supports both the dev nested binary and the packaged root fallback', () => {
    const base = mkdtempSync(join(tmpdir(), 'freecode-binary-'));
    try {
      const nested = join(base, 'opencode2api');
      mkdirSync(nested);
      writeFileSync(join(nested, 'opencode2api-linux-x64'), 'fixture');
      expect(resolveOpencodeBinary(base, 'linux')).toBe(join(nested, 'opencode2api-linux-x64'));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('uses Electron executable plus run-as-node only when packaged', () => {
    expect(resolveNodePath({ packaged: true, executablePath: 'electron.exe' })).toBe('electron.exe');
    expect(nodeRuntimeEnv(true)).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
    expect(nodeRuntimeEnv(false)).toEqual({});
  });
});
