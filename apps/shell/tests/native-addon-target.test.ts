import { describe, expect, it } from 'vitest';
import { classifyNativeAddon } from '../../../scripts/native-addon-target.mjs';

describe('native addon target classification', () => {
  it.each([
    ['native-darwin-arm64/addon.node', 'darwin-arm64'],
    ['native-linux-x64-gnu/addon.node', 'linux-x64-gnu'],
    ['native-win32-arm64-msvc/addon.node', 'win32-arm64-msvc'],
  ])('skips foreign target %s', (relativePath, target) => {
    expect(classifyNativeAddon(relativePath, { platform: 'win32', arch: 'x64' }))
      .toMatchObject({ kind: 'foreign', target });
  });

  it('treats untagged and matching MSVC addons as host-required', () => {
    expect(classifyNativeAddon('native/addon.node', { platform: 'win32', arch: 'x64' }))
      .toMatchObject({ kind: 'host' });
    expect(classifyNativeAddon('native-win32-x64-msvc/addon.node', { platform: 'win32', arch: 'x64' }))
      .toMatchObject({ kind: 'host', target: 'win32-x64-msvc' });
  });

  it('skips Windows GNU prebuilds from the MSVC Electron target', () => {
    expect(classifyNativeAddon('node_modules/@rollup/rollup-win32-x64-gnu/addon.node', {
      platform: 'win32',
      arch: 'x64',
    })).toMatchObject({
      kind: 'foreign',
      target: 'win32-x64-gnu',
      reason: expect.stringMatching(/variant gnu does not match msvc/i),
    });
  });

  it('uses the host Linux libc when classifying gnu and musl builds', () => {
    expect(classifyNativeAddon('native-linux-x64-musl/addon.node', {
      platform: 'linux',
      arch: 'x64',
      linuxLibc: 'gnu',
    })).toMatchObject({ kind: 'foreign', reason: expect.stringMatching(/musl does not match gnu/i) });
    expect(classifyNativeAddon('native-linux-x64-gnu/addon.node', {
      platform: 'linux',
      arch: 'x64',
      linuxLibc: 'gnu',
    })).toMatchObject({ kind: 'host' });
    expect(classifyNativeAddon('native-linux-arm-gnueabihf/addon.node', {
      platform: 'linux',
      arch: 'arm',
      linuxLibc: 'gnu',
    })).toMatchObject({ kind: 'host', target: 'linux-arm-gnu' });
  });
});
