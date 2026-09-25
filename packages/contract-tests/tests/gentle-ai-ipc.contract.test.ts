/**
 * Gentle-AI IPC contract tests — STRICT TDD RED.
 *
 * Covers specs/gentle-ai-ipc + gentle-ai-binary:
 * Zod channels, bounds, preload shape, resolver, doctor, caps, no-secret.
 * These tests reference production code that does NOT exist yet
 * (shared-types gentle-ai schemas, shell resolver/wrapper).
 * RED phase: they MUST fail before implementation.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '../../..');
const SHARED_TYPES_ENTRY = join(ROOT, 'packages/shared-types/src/index.ts');
const PRELOAD_ENTRY = join(ROOT, 'apps/shell/src/preload/index.ts');
const IPC_ENTRY = join(ROOT, 'apps/shell/src/main/ipc.ts');
const RESOLVER_ENTRY = join(ROOT, 'apps/shell/src/main/gentle-ai-resolver.ts');
const WRAPPER_ENTRY = join(ROOT, 'apps/shell/src/main/gentle-ai.ts');

describe('gentle-ai IPC — Zod contract (RED)', () => {
  it('shared-types exposes exactly gentle-ai:status|doctor|run channels', async () => {
    const mod = await import('@freecode/shared-types');
    expect(mod.IpcChannels.gentleAiStatus).toBe('gentle-ai:status');
    expect(mod.IpcChannels.gentleAiDoctor).toBe('gentle-ai:doctor');
    expect(mod.IpcChannels.gentleAiRun).toBe('gentle-ai:run');
    const channels = Object.values(mod.IpcChannels as Record<string, string>);
    expect(channels.filter((c) => c.startsWith('gentle-ai:')).sort()).toEqual([
      'gentle-ai:doctor',
      'gentle-ai:run',
      'gentle-ai:status',
    ]);
  });

  it('valid status payload parses; malformed run payload rejected pre-spawn', async () => {
    const mod = await import('@freecode/shared-types');
    expect(mod.GentleAiStatusSchema).toBeDefined();
    expect(mod.GentleAiRunRequestSchema).toBeDefined();
    const status = mod.GentleAiStatusSchema.parse({
      available: true,
      binaryPath: '/tmp/gentle-ai.exe',
      doctorPass: true,
    });
    expect(status.available).toBe(true);
    expect(() => mod.GentleAiRunRequestSchema.parse({})).toThrow();
    expect(() => mod.GentleAiRunRequestSchema.parse({ prompt: '' })).toThrow();
  });

  it('oversize run input rejected by schema (no spawn)', async () => {
    const mod = await import('@freecode/shared-types');
    const big = 'x'.repeat(65 * 1024);
    expect(() => mod.GentleAiRunRequestSchema.parse({ prompt: big })).toThrow();
  });
});

describe('gentle-ai IPC — preload projection (RED)', () => {
  it('preload exposes window.freecode.gentleAi with status/doctor/run', () => {
    const src = readFileSync(PRELOAD_ENTRY, 'utf8');
    expect(src).toContain('gentleAi');
    expect(src).toContain('gentle-ai:status');
    expect(src).toContain('gentle-ai:doctor');
    expect(src).toContain('gentle-ai:run');
    expect(src).toContain('contextBridge');
  });

  it('renderer never touches ipcRenderer directly for gentle-ai', () => {
    const src = readFileSync(PRELOAD_ENTRY, 'utf8');
    expect(src).not.toMatch(/window\.ipcRenderer/);
    expect(src).toContain('contextIsolation');
  });

  it('ipc.ts registers exactly three gentle-ai handlers with Zod', () => {
    const src = readFileSync(IPC_ENTRY, 'utf8');
    expect(src).toContain('gentleAiStatus');
    expect(src).toContain('gentleAiDoctor');
    expect(src).toContain('gentleAiRun');
  });
});

describe('gentle-ai binary — resolver (RED)', () => {
  it('bundled resources/gentle-ai/gentle-ai.exe preferred', async () => {
    const { resolveGentleAiBinary, _clearCache } = await import(
      '../../../apps/shell/src/main/gentle-ai-resolver.js'
    );
    _clearCache();
    const dir = mkdtempSync(join(tmpdir(), 'gentle-red-'));
    try {
      const binDir = join(dir, 'gentle-ai');
      mkdirSync(binDir);
      writeFileSync(join(binDir, 'gentle-ai.exe'), 'fake');
      expect(resolveGentleAiBinary(dir)).toBe(join(binDir, 'gentle-ai.exe'));
    } finally {
      _clearCache();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('null-safe absence without throwing', async () => {
    const { resolveGentleAiBinary, isGentleAiAvailable, _clearCache } = await import(
      '../../../apps/shell/src/main/gentle-ai-resolver.js'
    );
    _clearCache();
    vi.stubEnv('PATH', tmpdir());
    const dir = mkdtempSync(join(tmpdir(), 'gentle-empty-'));
    try {
      expect(resolveGentleAiBinary(dir)).toBeNull();
      expect(isGentleAiAvailable(dir)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      _clearCache();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('gentle-ai binary — doctor and caps (RED)', () => {
  it('doctor reports missing binary with remediation and no secret', async () => {
    const { runGentleAiDoctor } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    const { _clearCache } = await import(
      '../../../apps/shell/src/main/gentle-ai-resolver.js'
    );
    // Hermetic: hide any machine PATH gentle-ai (e.g. dev boxes with the
    // real binary installed) so absence is deterministic.
    const emptyPathDir = mkdtempSync(join(tmpdir(), 'gentle-empty-path-'));
    vi.stubEnv('PATH', process.platform === 'win32'
      ? `${emptyPathDir};${join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')}`
      : `${emptyPathDir}:/usr/bin:/bin`);
    _clearCache();
    const resourcesDir = mkdtempSync(join(tmpdir(), 'gentle-doc-'));
    const homeDir = mkdtempSync(join(tmpdir(), 'gentle-home-'));
    try {
      const result = await runGentleAiDoctor(resourcesDir, homeDir);
      expect(result.pass).toBe(false);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks[0]).toMatchObject({ pass: false });
      const text = JSON.stringify(result);
      expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
      expect(text).not.toContain('DEEPSEEK_API_KEY');
    } finally {
      vi.unstubAllEnvs();
      _clearCache();
      rmSync(emptyPathDir, { recursive: true, force: true });
      rmSync(resourcesDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('output truncated safely at 256KB with flag', async () => {
    const { truncateGentleAiOutput, GENTLE_AI_OUTPUT_CAP } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    expect(GENTLE_AI_OUTPUT_CAP).toBe(256 * 1024);
    const big = 'y'.repeat(256 * 1024 + 10);
    const out = truncateGentleAiOutput(big);
    expect(out.truncated).toBe(true);
    expect(out.output.length).toBeLessThanOrEqual(256 * 1024);
    const small = truncateGentleAiOutput('hello');
    expect(small).toEqual({ output: 'hello', truncated: false });
  });

  it('global mutation guarded without allow-global+backup+consent', async () => {
    const { isGlobalWriteAllowed } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    const home = mkdtempSync(join(tmpdir(), 'gentle-guard-'));
    try {
      expect(isGlobalWriteAllowed('C:\\Windows\\x', home, false)).toBe(false);
      expect(isGlobalWriteAllowed(join(home, 'sub'), home, false)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('status/doctor/run responses contain no secrets', async () => {
    const { getGentleAiStatus } = await import(
      '../../../apps/shell/src/main/gentle-ai.js'
    );
    const dir = mkdtempSync(join(tmpdir(), 'gentle-stat-'));
    try {
      const status = getGentleAiStatus(dir);
      const text = JSON.stringify(status);
      expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
      expect(text).not.toContain('DEEPSEEK_API_KEY');
      expect(text).not.toContain('FREECODE_PUBLIC_KEY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('gentle-ai IPC — source presence (RED)', () => {
  it('resolver and wrapper source files exist', () => {
    expect(existsSync(RESOLVER_ENTRY)).toBe(true);
    expect(existsSync(WRAPPER_ENTRY)).toBe(true);
    expect(existsSync(SHARED_TYPES_ENTRY)).toBe(true);
  });
});
