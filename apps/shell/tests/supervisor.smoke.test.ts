import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DSH_WEB_ARGS, HarnessSupervisor } from '../src/main/harness-supervisor.js';

/**
 * C5 — supervisor smoke: spawn the real dsh CLI (if built), grab the
 * readiness line `dsh web: http://127.0.0.1:<PORT>`, then shut down.
 *
 * The monorepo build (`pnpm run build` in vendor/deepseek-harness) is a
 * prerequisite; when the lib entries are missing the test is skipped so the
 * suite stays green in a bare checkout.
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

describe('HarnessSupervisor (C5)', { skip: !built() }, () => {
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
  });

  it('spawns dsh web, grabs readiness URL, shuts down', async () => {
    const sup = new HarnessSupervisor({ nodePath: nodeCmd, cliEntry: CLI_ENTRY, homeDir, lbUrl });
    let ready: HarnessSupervisor['currentUrl'] = null;
    sup.onReady((h) => {
      ready = h.url;
    });

    await sup.start();
    try {
      const deadline = Date.now() + 40_000;
      while (!ready && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(ready).toBeTruthy();
      expect(ready).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(sup.statusValue).toBe('ready');
    } finally {
      await sup.stop();
    }
    expect(sup.statusValue).toBe('stopped');
  }, 90_000);
});
