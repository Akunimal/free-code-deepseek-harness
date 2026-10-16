import { describe, expect, it } from 'vitest';

describe('launchHiddenAndWait', () => {
  it.skipIf(process.platform !== 'win32')('keeps background Git credential helpers noninteractive without changing GUI-app policy', async () => {
    const { launchHiddenSync } = await import('../src/main/freecode-launcher.js');
    const result = launchHiddenSync({ executable: process.execPath, args: ['-e',
      'console.log(JSON.stringify([process.env.GIT_TERMINAL_PROMPT,process.env.GCM_INTERACTIVE,process.env.GCM_GUI_PROMPT]))'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '1', GCM_INTERACTIVE: 'true', GCM_GUI_PROMPT: '1' }, timeout: 5000 });
    expect(result.status).toBe(0);
    expect(JSON.parse(String(result.stdout))).toEqual(['0', 'never', '0']);
  });
  it.skipIf(process.platform !== 'win32')('refuses unsupported extra IPC handles instead of silently losing them', async () => {
    const { launchHidden } = await import('../src/main/freecode-launcher.js');
    expect(() => launchHidden({ executable: process.execPath, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })).toThrow(/explicit broker/);
  });
  it('preserves real Node stdout and stderr through the native helper', async () => {
    const { launchHiddenSync } = await import('../src/main/freecode-launcher.js');
    const result = launchHiddenSync({ executable: process.execPath,
      args: ['-e', 'console.log("stdio-out"); console.error("stdio-err"); process.exitCode=23'], timeout: 5000 });
    expect(result.status).toBe(23);
    expect(result.stdout).toContain('stdio-out');
    expect(result.stderr).toContain('stdio-err');
  });
  it('waits for an owned hidden child without blocking the event loop', async () => {
    const module = await import('../src/main/freecode-launcher.js');
    const runner = Reflect.get(module, 'launchHiddenAndWait') as ((options: {
      executable: string;
      args: string[];
      timeoutMs: number;
    }) => Promise<{ exitCode: number | null; signal: string | null }>) | undefined;
    expect(runner).toBeTypeOf('function');
    if (!runner) return;

    let timerFired = false;
    const child = runner({
      executable: process.execPath,
      args: ['-e', 'setTimeout(() => process.exit(0), 100)'],
      timeoutMs: 2_000,
    });
    await new Promise<void>(resolve => setTimeout(() => {
      timerFired = true;
      resolve();
    }, 10));

    expect(timerFired).toBe(true);
    await expect(child).resolves.toMatchObject({ exitCode: 0 });
  });

  it('times out and terminates only the child it started', async () => {
    const module = await import('../src/main/freecode-launcher.js');
    const runner = Reflect.get(module, 'launchHiddenAndWait') as ((options: {
      executable: string;
      args: string[];
      timeoutMs: number;
    }) => Promise<unknown>) | undefined;
    expect(runner).toBeTypeOf('function');
    if (!runner) return;

    await expect(runner({
      executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1_000)'],
      timeoutMs: 30,
    })).rejects.toThrow(/timed out/i);
  });
});
