import { describe, expect, it } from 'vitest';

describe('launchHiddenAndWait', () => {
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
