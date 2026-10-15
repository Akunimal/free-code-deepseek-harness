import { describe, expect, it } from 'vitest';
import { IpcChannels, TorStatusSchema } from '@freecode/shared-types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../..');

describe('Tor IPC contract (0.9.4)', () => {
  it('exposes Tor status and lifecycle without the overlay rotation channel', () => {
    expect(IpcChannels.torStatus).toBe('tor:status');
    expect(IpcChannels.torGetStatus).toBe('tor:getStatus');
    expect(IpcChannels.torStart).toBe('tor:start');
    expect(IpcChannels.torStop).toBe('tor:stop');
  });

  it('accepts the TorManager status snapshot', () => {
    const sample = {
      active: true,
      status: 'ready',
      socksPort: 9050,
      controlPort: 9051,
      pid: 1234,
      circuitCount: 1,
      lastRotatedAt: null,
      lastError: null,
    };
    expect(TorStatusSchema.parse(sample)).toEqual(sample);
  });

  it('rejects an unknown tor status value', () => {
    const bad = {
      active: false,
      status: 'spinning',
      socksPort: 9050,
      controlPort: 9051,
      pid: -1,
      circuitCount: 0,
      lastRotatedAt: null,
      lastError: 'nope',
    };
    expect(() => TorStatusSchema.parse(bad)).toThrow();
  });

  it('does not expose the removed overlay-only rotate bridge', () => {
    expect(IpcChannels).not.toHaveProperty('torRotate');
    const preload = readFileSync(join(root, 'apps/shell/src/preload/index.ts'), 'utf8');
    const mainIpc = readFileSync(join(root, 'apps/shell/src/main/ipc.ts'), 'utf8');
    expect(preload).not.toContain('torRotate');
    expect(mainIpc).not.toContain('IpcChannels.torRotate');
  });
});
