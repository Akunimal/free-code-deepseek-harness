import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DSH_WEB_ARGS,
  HIDDEN_CHILD_PROCESS_OPTIONS,
  HarnessSupervisor,
} from '../src/main/harness-supervisor.js';

/**
 * C5 — supervisor smoke: spawn the real dsh CLI (if built), grab the
 * readiness line `dsh web: http://127.0.0.1:<PORT>/?token=...`, then shut down.
 *
 * The monorepo build (`pnpm run build` in vendor/deepseek-harness) is a
 * prerequisite; a missing lib entry is a release-test failure rather than a
 * silent skip, because packaging must ship this runtime.
 */

const VENDOR = join(import.meta.dirname, '../../../vendor/deepseek-harness');
const CLI_ENTRY = join(VENDOR, 'apps/cli/lib/bin.js');

const nodeCmd =
  process.platform === 'win32'
    ? process.env.DSH_TEST_NODE ?? 'C:\\Program Files\\nodejs\\node.exe'
    : 'node';

function built(): boolean {
  return existsSync(CLI_ENTRY);
}

function visibleWindowsInTree(rootPid: number): number {
  if (process.platform !== 'win32') return 0;
  const script = [
    `$ids = @(${rootPid})`,
    'for ($i = 0; $i -lt $ids.Count; $i++) {',
    '  $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId=" + $ids[$i]) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessId)',
    '  foreach ($child in $children) { if ($ids -notcontains $child) { $ids += $child } }',
    '}',
    '$visible = @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_.MainWindowHandle -ne 0 })',
    '$visible.Count',
  ].join('\n');
  const output = execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], { encoding: 'utf8', windowsHide: true });
  return Number.parseInt(output.trim(), 10) || 0;
}

describe('HarnessSupervisor (C5)', () => {
  beforeAll(() => {
    expect(built(), `missing built dsh CLI: ${CLI_ENTRY}; run the upstream build before release tests`).toBe(true);
  });
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-sup-test-'));
  const homeDir = join(tmp, 'home');
  const lbUrl = 'http://127.0.0.1:1'; // LB not started in this smoke; supervisor must not care

  afterAll(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it('keeps the child web runtime headless', () => {
    expect(DSH_WEB_ARGS).toContain('--no-open');
    expect(HIDDEN_CHILD_PROCESS_OPTIONS).toEqual({ windowsHide: true, shell: false });
  });

  it('spawns dsh web, grabs readiness URL, shuts down', async () => {
    const sup = new HarnessSupervisor({ nodePath: nodeCmd, cliEntry: CLI_ENTRY, homeDir, lbUrl });
    let ready: HarnessSupervisor['currentUrl'] = null;
    let readyPid: number | null = null;
    sup.onReady((h) => {
      ready = h.url;
      readyPid = h.pid;
    });

    await sup.start();
    try {
      // The first Windows boot may materialize the profile's workspace
      // modules. This must exceed the supervisor's cold-start budget.
      const deadline = Date.now() + 120_000;
      while (!ready && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(ready).toBeTruthy();
      expect(ready).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=\S+$/);
      expect(sup.statusValue).toBe('ready');
      if (process.platform === 'win32') {
        expect(readyPid).toBeGreaterThan(0);
        expect(visibleWindowsInTree(readyPid!)).toBe(0);
      }
    } finally {
      await sup.stop();
    }
    expect(sup.statusValue).toBe('stopped');
  // Keep the Vitest budget above the cold-start readiness budget. The
  // supervisor itself allows 120s for the first Windows workspace materialize;
  // a 90s test timeout could abort healthy startup and leak a child process.
  }, 180_000);
});

describe('HarnessSupervisor lifecycle hardening', () => {
  it('reports an unspawnable executable through the bounded stuck contract', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dsh-sup-spawn-error-'));
    const logs: string[] = [];
    // Windows reports both a missing executable (pre-spawn validation) and
    // an invalid image (spawn UNKNOWN) synchronously, so the supervisor's
    // sync throw branch owns this contract here. The async 'error'-event
    // handler stays as defense-in-depth for delete-between-check-and-spawn
    // races, which cannot be triggered deterministically.
    const notExecutable = join(tmp, 'not-an-executable.exe');
    writeFileSync(notExecutable, 'this is not a PE image', 'utf8');
    const supervisor = new HarnessSupervisor({
      nodePath: notExecutable,
      cliEntry: join(tmp, 'missing-cli.mjs'),
      homeDir: join(tmp, 'home'),
      lbUrl: null,
      backoffBaseMs: 1,
      restartBudget: 2,
      log: (_level, message) => logs.push(message),
    });
    let stuck = false;
    supervisor.onStuck(() => { stuck = true; });
    try {
      await supervisor.start();
      const deadline = Date.now() + 5_000;
      while (!stuck && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
      expect(stuck).toBe(true);
      expect(logs.some((message) => message === 'dsh spawn failed — no child process created')).toBe(true);
      expect(supervisor.currentPid).toBeNull();
    } finally {
      await supervisor.stop();
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 10_000);

  it('does not double-spawn when an explicit restart races the old exit event', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dsh-sup-generation-'));
    const homeDir = join(tmp, 'home');
    const startsFile = join(tmp, 'starts.log');
    const cliEntry = join(tmp, 'stub-cli.mjs');
    writeFileSync(cliEntry, `
      import { appendFileSync } from 'node:fs';
      appendFileSync(${JSON.stringify(startsFile)}, 'start\\n');
      console.log('dsh web: http://127.0.0.1:0/?token=stub');
      setInterval(() => {}, 1000);
    `, 'utf8');

    const supervisor = new HarnessSupervisor({
      nodePath: process.execPath,
      cliEntry,
      homeDir,
      lbUrl: 'http://127.0.0.1:1',
      backoffBaseMs: 10,
    });
    let readyCount = 0;
    supervisor.onReady(() => { readyCount++; });

    try {
      await supervisor.start();
      const firstDeadline = Date.now() + 5_000;
      while (readyCount < 1 && Date.now() < firstDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(readyCount).toBe(1);

      await supervisor.restart();
      const secondDeadline = Date.now() + 5_000;
      while (readyCount < 2 && Date.now() < secondDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(readyCount).toBe(2);

      const starts = readFileSync(startsFile, 'utf8').trim().split(/\r?\n/u).filter(Boolean);
      expect(starts).toHaveLength(2);
    } finally {
      await supervisor.stop();
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  it('survives 50 start/restart/stop cycles with one active generation', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dsh-sup-cycles-'));
    const homeDir = join(tmp, 'home');
    const startsFile = join(tmp, 'starts.log');
    const cliEntry = join(tmp, 'stub-cli.mjs');
    writeFileSync(cliEntry, `
      import { appendFileSync } from 'node:fs';
      appendFileSync(${JSON.stringify(startsFile)}, 'start\\n');
      console.log('dsh web: http://127.0.0.1:0/?token=cycle');
      setInterval(() => {}, 1000);
    `, 'utf8');

    const supervisor = new HarnessSupervisor({
      nodePath: process.execPath,
      cliEntry,
      homeDir,
      lbUrl: 'http://127.0.0.1:1',
      backoffBaseMs: 1,
    });
    let readyCount = 0;
    supervisor.onReady(() => { readyCount++; });

    const waitForReady = async (expected: number): Promise<void> => {
      const deadline = Date.now() + 5_000;
      while (readyCount < expected && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(readyCount).toBe(expected);
    };

    try {
      await supervisor.start();
      await waitForReady(1);
      for (let cycle = 1; cycle <= 50; cycle++) {
        await supervisor.restart();
        await waitForReady(cycle + 1);
      }
      const starts = readFileSync(startsFile, 'utf8').trim().split(/\r?\n/u).filter(Boolean);
      expect(starts).toHaveLength(51);
      expect(supervisor.statusValue).toBe('ready');
    } finally {
      await supervisor.stop();
      rmSync(tmp, { recursive: true, force: true });
    }
    expect(supervisor.statusValue).toBe('stopped');
  }, 60_000);
});
