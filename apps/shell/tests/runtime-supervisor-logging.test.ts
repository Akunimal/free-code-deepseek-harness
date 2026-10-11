import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createShellRuntime } from '../src/main/runtime.js';
import { HarnessSupervisor } from '../src/main/harness-supervisor.js';

const waitFor = async (predicate: () => boolean, timeoutMs = 5_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(predicate()).toBe(true);
};

describe('runtime supervisor diagnostics', () => {
  it('forwards child startup diagnostics to the configured shell logger', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-runtime-logs-'));
    const cliEntry = join(tempRoot, 'dsh', 'apps', 'cli', 'lib', 'bin.js');
    mkdirSync(join(tempRoot, 'dsh', 'apps', 'cli', 'lib'), { recursive: true });
    writeFileSync(cliEntry, "process.stderr.write('fixture startup failure\\n', () => setTimeout(() => process.exit(0), 25));\n", 'utf8');
    const entries: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
    const runtime = await createShellRuntime({
      resourcesDir: tempRoot,
      nodePath: process.execPath,
      userDataDir: join(tempRoot, 'user-data'),
      log: (level, message, meta) => entries.push({ level, message, meta }),
    });

    try {
      await runtime.start();
      await waitFor(() => entries.some((entry) => entry.message === 'dsh exited'));
      await waitFor(() => entries.some((entry) => entry.message.includes('dsh stderr: fixture startup failure')));
      expect(entries.some((entry) => entry.message === 'dsh exited')).toBe(true);
      expect(entries.some((entry) => entry.message.includes('fixture startup failure'))).toBe(true);
    } finally {
      await runtime.stop();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 10_000);

  it('includes exit status in the bounded stuck tail after silent successful exits', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-supervisor-exit-tail-'));
    const cliEntry = join(tempRoot, 'silent-cli.mjs');
    writeFileSync(cliEntry, 'process.exit(0);\n', 'utf8');
    const supervisor = new HarnessSupervisor({
      nodePath: process.execPath,
      cliEntry,
      homeDir: join(tempRoot, 'home'),
      lbUrl: null,
      backoffBaseMs: 1,
      restartBudget: 1,
    });
    let stuckTail: string | undefined;
    supervisor.onStuck((instance) => { stuckTail = instance.lastOutputTail; });

    try {
      await supervisor.start();
      await waitFor(() => stuckTail !== undefined);
      expect(stuckTail).toContain('dsh exited code=0 signal=null');
      expect(stuckTail!.length).toBeLessThanOrEqual(4_000);
    } finally {
      await supervisor.stop();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 10_000);
});
