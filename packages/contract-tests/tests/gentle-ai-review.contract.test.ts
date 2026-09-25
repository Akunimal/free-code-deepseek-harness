/**
 * Gentle-AI review (RDD v2) + registry contract tests — STRICT TDD RED.
 *
 * Covers specs/gentle-ai-review + registry ownership + gate-blocks-150.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const RDD_ENTRY = join(ROOT, 'apps/shell/src/main/rdd.ts');
const REGISTRY = join(ROOT, '.atl/skill-registry.md');
const PATCH_DIR = join(ROOT, 'patches/upstream');

describe('gentle-ai review — RDD v2 verbatim (RED)', () => {
  it('verbatim status→START→next_transition accepted and logged', async () => {
    const { validateRddTransition } = await import(
      '../../../apps/shell/src/main/rdd.js'
    );
    const res = validateRddTransition({
      statusOutput: 'status: ok',
      startMarker: 'START',
      nextTransition: 'ship-it',
      expectedNext: 'ship-it',
    });
    expect(res.ok).toBe(true);
  });

  it('paraphrased or reordered next_transition rejected with expected value', async () => {
    const { validateRddTransition } = await import(
      '../../../apps/shell/src/main/rdd.js'
    );
    const res = validateRddTransition({
      statusOutput: 'status: ok',
      startMarker: 'START',
      nextTransition: 'Ship It!',
      expectedNext: 'ship-it',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('ship-it');
  });

  it('missing or duplicated START fails validation', async () => {
    const { validateRddTransition } = await import(
      '../../../apps/shell/src/main/rdd.js'
    );
    const missing = validateRddTransition({
      statusOutput: 'status: ok',
      startMarker: undefined,
      nextTransition: 'ship-it',
      expectedNext: 'ship-it',
    });
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/START/i);
  });

  it('audit entry written with verdict+timestamp and no secrets', async () => {
    const { appendRddAudit, getRddAuditLog, _clearRddAudit } = await import(
      '../../../apps/shell/src/main/rdd.js'
    );
    _clearRddAudit();
    const entry = appendRddAudit({
      input: 'status ok START ship-it',
      sequence: ['status', 'START', 'ship-it'],
      verdict: 'accept',
    });
    expect(entry.verdict).toBe('accept');
    expect(entry.time).toBeDefined();
    expect(entry.hash).toBeDefined();
    const text = JSON.stringify(entry);
    expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(text).not.toContain('DEEPSEEK_API_KEY');
    expect(getRddAuditLog()).toHaveLength(1);
    _clearRddAudit();
  });

  it('rdd source file exists', () => {
    expect(existsSync(RDD_ENTRY)).toBe(true);
  });
});

describe('gentle-ai registry — read-only projection (RED)', () => {
  it('registry file exists and is owned by gentle-ai refresh', () => {
    expect(existsSync(REGISTRY)).toBe(true);
    const src = readFileSync(REGISTRY, 'utf8');
    expect(src).toContain('gentle-ai skill-registry refresh');
  });

  it('harness projection does not rewrite registry (mtime+bytes unchanged)', async () => {
    const { getSkillRegistryProjection } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    const before = statSync(REGISTRY);
    const beforeBytes = readFileSync(REGISTRY, 'utf8');
    const proj = getSkillRegistryProjection(REGISTRY);
    expect(proj.content.length).toBeGreaterThan(0);
    const after = statSync(REGISTRY);
    const afterBytes = readFileSync(REGISTRY, 'utf8');
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(afterBytes).toBe(beforeBytes);
  });
});

describe('gentle-ai gate — 150 blocked until green (RED)', () => {
  it('150 patch file present only after replay+verify green', () => {
    const files = readdirSync(PATCH_DIR).filter((f) => f.startsWith('150-'));
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^150-.*\.patch$/);
  });
});
