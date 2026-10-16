import { describe, expect, it, vi, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateGuiLaunch, guiLaunchEnvironment, launchInteractiveGui } from '../src/main/interactive-gui.js';

vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawn: vi.fn(original.spawn) };
});
afterEach(() => vi.clearAllMocks());

describe('explicit interactive GUI exception', () => {
  it('rejects interpreters, non-PE files, relative paths and malformed argv', () => {
    for (const value of [{ command: 'pwsh.exe', args: [] }, { command: process.execPath, args: [] },
      { command: import.meta.filename, args: [] }, { command: process.execPath, args: [null] },
      { command: fileURLToPath(new URL('../resources/freecode/headless-host.exe', import.meta.url)), args: ['--eval'], electronCli: true }]) {
      expect(() => validateGuiLaunch(value)).toThrow();
    }
  });

  it('does not leak provider, Electron or bridge credentials into a GUI app', () => {
    expect(guiLaunchEnvironment({ Path: 'tools', SystemRoot: 'Windows', DEEPSEEK_API_KEY: 'secret',
      NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1', FREECODE_DIALOG_BRIDGE_TOKEN: 'secret' })).toEqual({
      Path: 'tools', SystemRoot: 'Windows',
    });
  });

  it.skipIf(process.platform !== 'win32')('launches only a verified GUI-subsystem test helper without a shell', async () => {
    const command = fileURLToPath(new URL('../resources/freecode/headless-host.exe', import.meta.url));
    expect(validateGuiLaunch({ command, args: ['--build-info'] })).toEqual({ command, args: ['--build-info'] });
    await expect(launchInteractiveGui({ command, args: ['--build-info'] })).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(1);
    const options = vi.mocked(spawn).mock.calls[0]?.[2];
    expect(options?.windowsHide).toBe(false);
    expect(options?.shell).toBe(false);
    expect(options?.detached).toBe(true);
    expect(options?.stdio).toBe('ignore');
  });
});
