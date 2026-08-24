import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Startup preflight — verifies the harness runtime layout is intact before
 * spawning the supervisor. Catches installer bugs that silently truncate the
 * shipped dsh workspace (F2/F3 postmortem: NSIS customInstall wiping apps/,
 * runtime updater tarball missing files) with a specific error naming the
 * missing path, instead of the confusing "supervisor gave up after 5 restarts"
 * that surfaces 30+ seconds later.
 *
 * Only pure fs checks — no imports of runtime code — so this module is safe
 * to unit-test without spinning up Electron.
 */

export interface PreflightOptions {
  /** Resources root containing dsh/, opencode2api/, runtime-manifest.json. */
  resourcesDir: string;
  /** Platform for opencode2api binary presence check. */
  platform?: NodeJS.Platform;
}

export interface PreflightResult {
  ok: boolean;
  /** Human-readable list of missing paths, in stable order for tests. */
  missing: string[];
  /** Extra diagnostics: bridge bundle staleness, manifest sanity, etc. */
  warnings: string[];
}

/**
 * Critical files that must exist for the shell to boot the harness. Order
 * matters: earlier entries are more fundamental (missing bin.js is fatal;
 * missing bridge bundle is a soft warning until we prove the invariant).
 */
function criticalPaths(resourcesDir: string, platform: NodeJS.Platform): { path: string; label: string }[] {
  const dsh = join(resourcesDir, 'dsh');
  const paths = [
    { path: join(resourcesDir, 'runtime-manifest.json'), label: 'runtime manifest' },
    { path: join(dsh, 'apps', 'cli', 'lib', 'bin.js'), label: 'dsh CLI entry (apps/cli/lib/bin.js)' },
    { path: join(dsh, 'packages'), label: 'dsh packages/' },
    { path: join(dsh, 'node_modules'), label: 'dsh node_modules/' },
    { path: join(dsh, 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'index.js'),
      label: 'directory-picker-native bundle' },
  ];
  if (platform === 'win32') {
    paths.push({ path: join(resourcesDir, 'opencode2api', 'opencode2api-win-x64.exe'), label: 'opencode2api worker binary' });
  } else if (platform === 'linux') {
    paths.push({ path: join(resourcesDir, 'opencode2api', 'opencode2api-linux-x64'), label: 'opencode2api worker binary' });
  }
  return paths;
}

/**
 * Bridge invariant: on win32 the shipped bundle MUST contain the bridge
 * env-var reference. If source has it but the compiled bundle does not, the
 * install will crash on directory picker click (F1 postmortem: v0.2.4
 * shipped with stale `lib/index.js` that lacked the bridge code path).
 */
function verifyBridgeInvariant(resourcesDir: string): string | null {
  const bundle = join(resourcesDir, 'dsh', 'node_modules', '@deepseek-ai',
    'dsh-host-directory-picker-native', 'lib', 'index.js');
  if (!existsSync(bundle)) return null; // already reported as missing above
  try {
    const contents = readFileSync(bundle, 'utf8');
    if (!contents.includes('FREECODE_DIALOG_BRIDGE_ENDPOINT')) {
      return 'directory-picker-native bundle lacks Electron dialog bridge — Win32 picker will crash. Rebuild vendor and repackage.';
    }
  } catch {
    // Read failure covered by the existsSync check above.
  }
  return null;
}

/** Retry policy for {@link awaitHarnessLayout}. */
export interface PreflightRetryOptions extends PreflightOptions {
  /** Total attempts including the first. Default 6. */
  attempts?: number;
  /** Delay between attempts, ms. Default 1000. */
  delayMs?: number;
  /** Injectable sleep for deterministic tests. Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each retry (e.g. to update a splash message). */
  onRetry?: (attempt: number, result: PreflightResult) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Verify the harness layout, retrying while it looks incomplete.
 *
 * An auto-update relaunches the app in the window where the NSIS setup has
 * only just finished extracting 600+ node_modules dirs; Windows disk
 * buffering, indexing, and antivirus scanning can leave `readdirSync` briefly
 * reporting a freshly-written directory as empty. A single synchronous check
 * at T+30ms then treats a *settling* install as a *broken* one and kills the
 * app (the v0.2.5 auto-update false positive).
 *
 * A genuinely broken install (installer bug that deletes after extraction)
 * stays empty across every attempt and still fails — the retries cost a few
 * seconds, not correctness. Only a transient settling window is absorbed.
 *
 * @returns The first ok result, or the last failing result after all attempts.
 */
export async function awaitHarnessLayout(options: PreflightRetryOptions): Promise<PreflightResult> {
  const attempts = Math.max(1, options.attempts ?? 6);
  const delayMs = Math.max(0, options.delayMs ?? 1_000);
  const sleep = options.sleep ?? defaultSleep;
  let result = verifyHarnessLayout(options);
  for (let attempt = 1; attempt < attempts && !result.ok; attempt++) {
    options.onRetry?.(attempt, result);
    await sleep(delayMs);
    result = verifyHarnessLayout(options);
  }
  return result;
}

/**
 * Verify the harness runtime layout is complete and self-consistent.
 * @param options - Resource paths and platform.
 * @returns Result naming every missing critical path.
 */
export function verifyHarnessLayout(options: PreflightOptions): PreflightResult {
  const platform = options.platform ?? process.platform;
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const { path, label } of criticalPaths(options.resourcesDir, platform)) {
    if (!existsSync(path)) {
      missing.push(`${label}: ${path}`);
      continue;
    }
    // Empty directory is as bad as missing — NSIS wipe leaves the dir stub.
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) {
        const entries = readEntries(path);
        if (entries === 0) missing.push(`${label}: ${path} (empty)`);
      }
    } catch {
      // Already reported.
    }
  }

  const bridgeWarning = verifyBridgeInvariant(options.resourcesDir);
  if (bridgeWarning) warnings.push(bridgeWarning);

  return { ok: missing.length === 0 && warnings.length === 0, missing, warnings };
}

function readEntries(dir: string): number {
  try {
    return require('node:fs').readdirSync(dir).length;
  } catch {
    return 0;
  }
}

/**
 * Format a preflight failure for a user-facing dialog. Two-line format: the
 * first line is a plain-language summary, then the specific missing files.
 * @param result - The failed preflight result.
 * @param reinstallHint - Localized "please reinstall from the official
 *   installer" string; kept out of this module so i18n stays in i18n.
 */
export function formatPreflightFailure(result: PreflightResult, reinstallHint: string): string {
  const lines: string[] = [];
  if (result.missing.length > 0) {
    lines.push('Harness runtime is incomplete:');
    for (const item of result.missing) lines.push(`  - ${item}`);
  }
  if (result.warnings.length > 0) {
    lines.push('');
    for (const warn of result.warnings) lines.push(warn);
  }
  lines.push('');
  lines.push(reinstallHint);
  return lines.join('\n');
}
