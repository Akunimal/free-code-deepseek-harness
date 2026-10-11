import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  nodeRuntimeEnv,
  resolveNodePath,
  resolveOpencodeBinary,
  resolveResourcesDir,
  resolveHarnessRuntimeDir,
} from '../src/main/resource-paths.js';

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

  it('stores a packaged DSH runtime in writable per-user data, not Program Files', () => {
    expect(resolveHarnessRuntimeDir({
      packaged: true,
      resourcesDir: 'C:/Program Files/FreeCode/resources/freecode',
      userDataDir: 'C:/Users/test/AppData/Roaming/FreeCode',
    })).toBe(join('C:/Users/test/AppData/Roaming/FreeCode', 'harness-runtime'));
  });

  it('keeps the development runtime beside its existing resources', () => {
    expect(resolveHarnessRuntimeDir({ packaged: false, resourcesDir: '/repo/resources/freecode' }))
      .toBe(resolve('/repo/resources/freecode'));
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

  it('selects the native macOS worker binary', () => {
    const base = mkdtempSync(join(tmpdir(), 'freecode-mac-binary-'));
    try {
      const nested = join(base, 'opencode2api');
      mkdirSync(nested);
      writeFileSync(join(nested, 'opencode2api-mac-x64'), 'fixture');
      expect(resolveOpencodeBinary(base, 'darwin', 'x64')).toBe(join(nested, 'opencode2api-mac-x64'));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

});
