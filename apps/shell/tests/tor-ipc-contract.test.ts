import { describe, expect, it } from 'vitest';
import { IpcChannels, TorStatusSchema } from '@freecode/shared-types';

describe('Tor IPC contract (0.9.1)', () => {
  it('exposes tor:getStatus alongside tor:status/tor:rotate', () => {
    expect(IpcChannels.torStatus).toBe('tor:status');
    expect(IpcChannels.torRotate).toBe('tor:rotate');
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
});
