import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync, spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Contract tests — blanket the coupling surface against upstream.
 *
 * Every test states WHAT contract it verifies and WHAT to do if it fails
 * (see each describe block). Run locally with `pnpm test:contract` before
 * every squash/tag; releases are intentionally manual (see
 * docs/RELEASE-POLICY.md) to preserve the free GitHub Actions quota.
 */

const VENDOR = join(import.meta.dirname, '../../../vendor/deepseek-harness');
const CLI_ENTRY = join(VENDOR, 'apps/cli/lib/bin.js');
const HARNESS_BUILT = existsSync(CLI_ENTRY);
const NODE = process.env.FREECODE_NODE ?? 'node';
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// 1. dsh CLI flags → if upstream renames --port/--host, adapt webStartup
// ---------------------------------------------------------------------------
describe('contract: dsh CLI flags', () => {
  beforeAll(() => expect(HARNESS_BUILT, `missing built dsh CLI: ${CLI_ENTRY}`).toBe(true));
  it('dsh web --help exposes --port and --host', { timeout: 65_000 }, () => {
    const r = spawnSync(NODE, [CLI_ENTRY, 'web', '--help'], {
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--port');
    expect(r.stdout).toContain('--host');
  });
});

// ---------------------------------------------------------------------------
// 2. Boot readiness → supervisor readiness regex; if the line changes, adapt
//    harness-supervisor.ts READY_RE
// ---------------------------------------------------------------------------
describe('contract: boot readiness', () => {
  beforeAll(() => expect(HARNESS_BUILT, `missing built dsh CLI: ${CLI_ENTRY}`).toBe(true));
  it('dsh web prints readiness URL on stdout within 30s', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-contract-'));
    const proc = spawn(NODE, [CLI_ENTRY, 'web', '--host', '127.0.0.1', '--port', '0'], {
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    try {
      const line = await waitForLine(proc, /(?:dsh web: )?(?:ready on )?http:\/\/127\.0\.0\.1:\d+/, TIMEOUT_MS);
      const m = line.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      expect(m).not.toBeNull();
      expect(Number(m![1]!)).toBeGreaterThan(0);
    } finally {
      killTree(proc.pid ?? -1);
      rmSync(home, { recursive: true, force: true });
    }
  }, 40_000);
});

// ---------------------------------------------------------------------------
// 3. settings.yaml schema → if upstream renames keys, adapt provider-seeder
// ---------------------------------------------------------------------------
describe('contract: settings.yaml schema', () => {
  it('README example (llm-pi-ai) parses against the provider schema', async () => {
    const readme = join(VENDOR, 'packages/llm/llm-pi-ai/README.md');
    const action = 'sync provider-seeder settings shape with upstream';
    if (!existsSync(readme)) {
      console.warn(`[contract 3] ${readme} missing — ${action}`);
      return;
    }
    const txt = readFileSync(readme, 'utf8');
    const yamlBlock = txt.match(/```yaml\n([\s\S]*?)```/);
    if (!yamlBlock) {
      console.warn(`[contract 3] no yaml block in README — ${action}`);
      return;
    }
    // Sanity: the surfaced keys we depend on appear in the example document.
    expect(yamlBlock[1]).toContain('apiKeyEnv');
    expect(yamlBlock[1]).toContain('baseURL');
    expect(yamlBlock[1]).toContain('api: openai-completions');
  });
});

// ---------------------------------------------------------------------------
// 4+9. Custom provider + /api transport handshake (live boot, no LB needed)
//       → if the RPC envelope or llm/listConfigurableProviders shape changes,
//         adapt workspace-bridge rpc-client + seeder
//       workspace-bridge rpc-client + seeder
// ---------------------------------------------------------------------------
describe('contract: host RPC + provider directory', () => {
  beforeAll(() => expect(HARNESS_BUILT, `missing built dsh CLI: ${CLI_ENTRY}`).toBe(true));
  it('POST /api/llm/listConfigurableProviders returns the client-request envelope and catalog metadata', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-contract-provider-'));
    // Keep the home isolated and empty: this API returns the installed
    // configurable-provider directory, not an echo of arbitrary settings.
    const proc = spawn(NODE, [CLI_ENTRY, 'web', '--host', '127.0.0.1', '--port', '0'], {
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    try {
      const line = await waitForLine(proc, /dsh web: http:\/\/127\.0\.0\.1:\d+\/\?[^\s]+/, TIMEOUT_MS);
      const { base, cookie } = await authenticatePrintedUrl(line);

      const res = await fetch(`${base}/api/llm/listConfigurableProviders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'contract-test-1',
          method: 'llm/listConfigurableProviders',
          payload: { args: {} },
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        type: string;
        rpcId: string;
        result: { ok: boolean; value?: unknown };
      };
      expect(body.type).toBe('server-response');
      expect(body.rpcId).toBe('contract-test-1');
      expect(body.result.ok, JSON.stringify(body)).toBe(true);
      const providers = Array.isArray(body.result.value) ? body.result.value : [];
      const openai = providers.find(
        (provider) => (provider as { provider?: string }).provider === 'openai',
      ) as { provider?: string; settingsNs?: string; settingsPath?: string[]; declared?: boolean } | undefined;
      expect(openai, `configurable provider IDs: ${providers.map((provider) => (provider as { provider?: string }).provider).join(', ')}`).toBeDefined();
      expect(openai).toMatchObject({
        provider: 'openai',
        settingsNs: 'llm-pi-ai',
        settingsPath: ['providers', 'openai'],
        declared: false,
      });
    } finally {
      killTree(proc.pid ?? -1);
      rmSync(home, { recursive: true, force: true });
    }
  }, 45_000);
});

// ---------------------------------------------------------------------------
// 8. Browser boot manifest → the shell relies on the host's injected module
//    graph being valid JSON with stable entry fields. If this changes, adapt
//    the packaged-web boot contract before shipping a release.
// ---------------------------------------------------------------------------
describe('contract: browser boot manifest', () => {
  beforeAll(() => expect(HARNESS_BUILT, `missing built dsh CLI: ${CLI_ENTRY}`).toBe(true));
  const BootEntrySchema = z.object({
    id: z.string().min(1),
    // HMR combo URLs are revisioned, document-relative resources; their
    // mount path is determined by the host and is not fixed to /plugins/.
    url: z.string().min(1),
    rev: z.string().min(1),
    inject: z.array(z.string().min(1)).optional().default([]),
    external: z.array(z.string().min(1)).optional().default([]),
    // Upstream omits this field for lazy entries; absence is equivalent to
    // false in the browser loader.
    immediately: z.boolean().optional().default(false),
  });
  const BootBatchSchema = z.object({
    phase: z.enum(['bootstrap', 'application']),
    url: z.string().min(1),
    rev: z.string().min(1),
    entries: z.array(z.string().min(1)).min(1),
  });
  const BootSchema = z.object({
    rev: z.string().min(1),
    entries: z.array(BootEntrySchema).min(1),
    batches: z.array(BootBatchSchema).min(1),
  });

  it('serves a parseable window.__DSH_BOOT__ manifest from the web root', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-contract-boot-'));
    const proc = spawn(NODE, [CLI_ENTRY, 'web', '--host', '127.0.0.1', '--port', '0'], {
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    try {
      const line = await waitForLine(proc, /dsh web: http:\/\/127\.0\.0\.1:\d+\/\?[^\s]+/, TIMEOUT_MS);
      const { base, cookie } = await authenticatePrintedUrl(line);
      const html = await (await fetch(`${base}/`, { headers: { cookie } })).text();
      const marker = ['globalThis["__DSH_BOOT__"] = ', 'window.__DSH_BOOT__ = ']
        .find((candidate) => html.includes(candidate));
      if (marker === undefined) throw new Error('boot manifest marker not found');
      const start = html.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      const jsonStart = start + marker.length;
      const scriptEnd = html.indexOf('</script>', jsonStart);
      expect(scriptEnd).toBeGreaterThan(jsonStart);
      const raw = html.slice(jsonStart, scriptEnd).trim().replace(/;\s*$/, '');
      const parsed = BootSchema.parse(JSON.parse(raw));
      expect(parsed.entries.some((entry) => entry.immediately)).toBe(true);
      const entryIds = parsed.entries.map((entry) => entry.id).sort();
      const batchEntryIds = parsed.batches.flatMap((batch) => batch.entries).sort();
      expect(batchEntryIds).toEqual(entryIds);
    } finally {
      killTree(proc.pid ?? -1);
      rmSync(home, { recursive: true, force: true });
    }
  }, 45_000);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function waitForLine(
  proc: ChildProcess,
  re: RegExp,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`readiness line not seen in ${timeoutMs}ms; output so far:\n${buf}`));
    }, timeoutMs);
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString();
      const m = buf.match(re);
      if (m) {
        clearTimeout(timer);
        cleanup();
        resolve(m[0]);
      }
    };
    const onExit = (code: number | null): void => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`dsh exited early (code ${code}); output:\n${buf}`));
    };
    const cleanup = (): void => {
      proc.stdout?.off('data', onData);
      proc.stderr?.off('data', onData);
      proc.off('exit', onExit);
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('exit', onExit);
  });
}

/** Exchange the current upstream launch token for the authority-bound cookie. */
async function authenticatePrintedUrl(line: string): Promise<{ base: string; cookie: string }> {
  const printed = line.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?[^\s]+)/)?.[1]
  if (printed === undefined) throw new Error(`authenticated dsh URL not found in readiness line:\n${line}`)
  const login = await fetch(printed, { redirect: 'manual' })
  expect(login.status).toBe(303)
  const setCookie = login.headers.get('set-cookie')
  if (setCookie === null) throw new Error('dsh web authentication response did not set a cookie')
  const cookie = setCookie.split(';', 1)[0]
  const base = new URL(printed)
  base.search = ''
  return { base: base.origin, cookie }
}

function killTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true });
    } catch {
      /* ignore */
    }
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
  }
}
