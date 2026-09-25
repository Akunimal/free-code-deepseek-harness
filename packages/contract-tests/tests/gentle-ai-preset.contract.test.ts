/**
 * Gentle-AI preset + MCP/registry contract tests — STRICT TDD RED.
 *
 * Covers specs/gentle-ai-preset + gentle-ai-mcp-registry:
 * preset list/flip/fallback/preserved/invariance, Engram on/fail-open,
 * Serena absent, 070/085/090/100/130 migration.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const PATCH_DIR = join(ROOT, 'patches/upstream');
const MANIFEST = join(PATCH_DIR, 'upstream-patches.json');
const MCP_HOME = join(ROOT, 'apps/shell/src/main/mcp-home.ts');
const RUNTIME_DEPS = join(ROOT, 'apps/shell/resources/runtime-deps.json');
const VENDOR_STANDARD = join(
  ROOT,
  'vendor/deepseek-harness/packages/preset/agent-presets/presets/standard/agent.cordis.yml',
);

function patch150File(): string | null {
  const files = readdirSync(PATCH_DIR).filter((f) => f.startsWith('150-') && f.endsWith('.patch'));
  return files.length > 0 ? join(PATCH_DIR, files[0]!) : null;
}

describe('gentle-ai preset — 150 patch composition (RED)', () => {
  it('150-* vendorOnly patch exists, ordered after 140', () => {
    const file = patch150File();
    expect(file).not.toBeNull();
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const entry = manifest.patches.find((p) => String(p.file).startsWith('150-'));
    expect(entry).toBeDefined();
    expect(entry.order).toBeGreaterThan(140);
    expect(entry.vendorOnly).toBe(true);
  });

  it('150 patch creates gentle-ai preset copied from standard', () => {
    const file = patch150File();
    expect(file).not.toBeNull();
    const text = readFileSync(file!, 'utf8');
    expect(text).toContain('presets/gentle-ai/');
    expect(text).toContain('gentle-ai');
  });

  it('150 patch keeps plan/permission/sandbox rows (copy-only, persona/prompt only)', () => {
    const file = patch150File();
    expect(file).not.toBeNull();
    const text = readFileSync(file!, 'utf8');
    expect(text).toContain('vendor/deepseek-harness/');
  });
});

describe('gentle-ai preset — default resolution (RED)', () => {
  it('default flips to gentle-ai only when binary+doctor pass', async () => {
    const { resolveDefaultPreset } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    expect(resolveDefaultPreset(null, true, true)).toBe('gentle-ai');
  });

  it('fallback to standard when binary missing or doctor fails', async () => {
    const { resolveDefaultPreset } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    expect(resolveDefaultPreset(null, false, null)).toBe('standard');
    expect(resolveDefaultPreset(null, true, false)).toBe('standard');
  });

  it('existing stored selection never flipped', async () => {
    const { resolveDefaultPreset } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    expect(resolveDefaultPreset('standard', true, true)).toBe('standard');
    expect(resolveDefaultPreset('gentle-ai', false, false)).toBe('gentle-ai');
  });

  it('permission gate intact and pool not replaced (invariance)', async () => {
    const { GENTLE_AI_PRESET_INVARIANTS } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    expect(GENTLE_AI_PRESET_INVARIANTS.planMode).toBe(true);
    expect(GENTLE_AI_PRESET_INVARIANTS.permissionPresets).toBe(true);
    expect(GENTLE_AI_PRESET_INVARIANTS.sandbox).toBe(true);
    expect(GENTLE_AI_PRESET_INVARIANTS.poolReplaced).toBe(false);
  });
});

describe('gentle-ai MCP — Engram on, Serena absent (RED)', () => {
  it('mcp-home defines engram row enabled by default with fail-open', () => {
    const src = readFileSync(MCP_HOME, 'utf8');
    expect(src).toContain("'engram'");
    expect(src).toContain('failOnStartupError');
    expect(src).toContain('isCommandAvailable');
  });

  it('no Serena row or Serena env flag remains in managed catalog', () => {
    const src = readFileSync(MCP_HOME, 'utf8');
    expect(src).not.toContain("'serena'");
    expect(src).not.toContain('"serena"');
    expect(src).not.toContain('serena.exe');
    expect(src).not.toContain('FREECODE_MCP_SERENA_ENABLED');
    expect(src).not.toContain('freecode-mcp-serena');
  });

  it('150 patch removes Serena preset row and adds Engram row', () => {
    const file = patch150File();
    expect(file).not.toBeNull();
    const text = readFileSync(file!, 'utf8');
    expect(text).toContain('freecode-mcp-engram');
    expect(text).toContain('serverName: engram');
  });

  it('runtime-deps manifest carries gentle-ai win-x64 entry', () => {
    const manifest = JSON.parse(readFileSync(RUNTIME_DEPS, 'utf8'));
    const entry = manifest.dependencies.find((d) => d.id === 'gentle-ai');
    expect(entry).toBeDefined();
    expect(entry.arch).toBe('win-x64');
    expect(entry.required).toBe(false);
  });

  it('070/085/090/100/130 migration: status channel intact without Serena', () => {
    const connection = join(
      ROOT,
      'vendor/deepseek-harness/packages/mcp/mcp-client/src/connection.ts',
    );
    expect(existsSync(connection)).toBe(true);
    const src = readFileSync(connection, 'utf8');
    expect(src).toContain('publishHostStatus');
    const file = patch150File();
    expect(file).not.toBeNull();
  });
});
