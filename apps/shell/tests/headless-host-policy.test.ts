import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createHeadlessHostPolicy } from '../src/main/headless-host-policy.js';

const helper = fileURLToPath(new URL('../resources/freecode/headless-host.exe', import.meta.url));

describe('OS headless boundary', () => {
  it('fails closed on Windows until a verified GUI helper is configured', () => {
    const policy = createHeadlessHostPolicy('win32');
    expect(() => policy.invocation('pwsh.exe', [])).toThrow(/not configured/);
    expect(() => policy.configure('missing-headless-host.exe')).toThrow();
    expect(() => policy.invocation('pwsh.exe', [])).toThrow(/not configured/);
  });

  it.skipIf(process.platform !== 'win32')('keeps every target argument literal and routes through the verified helper', () => {
    const policy = createHeadlessHostPolicy('win32');
    policy.configure(helper);
    expect(policy.invocation('pwsh.exe', ['-Command', 'a & b', ''])).toEqual({
      executable: helper, args: ['--', 'pwsh.exe', '-Command', 'a & b', ''],
    });
  });

  it('does not change non-Windows process launching', () => {
    expect(createHeadlessHostPolicy('linux').invocation('/bin/sh', ['-c', 'true'])).toEqual({
      executable: '/bin/sh', args: ['-c', 'true'],
    });
  });
});
