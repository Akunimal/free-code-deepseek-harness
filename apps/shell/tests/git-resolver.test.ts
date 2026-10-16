import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { headlessHostPolicy } from '../src/main/headless-host-policy.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveGitPath,
  validateGit,
  runGitCommand,
  classifyGitError,
  GitError,
  resetGitResolver,
} from '../src/git/git-resolver.js';

describe('Phase 5: Git resolver', () => {
  beforeEach(() => { resetGitResolver(); });
  afterEach(() => { resetGitResolver(); vi.restoreAllMocks(); });

  it('contains both Git discovery and Git operations through the native launch policy', () => {
    const invocation = vi.spyOn(headlessHostPolicy, 'invocation');
    const resolved = resolveGitPath();
    expect(invocation).toHaveBeenCalledWith(resolved.path, ['--version']);
    invocation.mockClear();
    const result = runGitCommand({ gitPath: resolved.path, args: ['--version'], cwd: process.cwd() });
    expect(result.exitCode).toBe(0);
    expect(invocation).toHaveBeenCalledWith(resolved.path, ['--version']);
  });

  it('resolves git from PATH', () => {
    const result = resolveGitPath();
    expect(result.path).toBeTruthy();
    expect(result.version).toMatch(/^git version/);
    expect(['system-path', 'system-absolute', 'packaged']).toContain(result.source);
  });

  it('caches resolution', () => {
    const first = resolveGitPath();
    const second = resolveGitPath();
    expect(first.path).toBe(second.path);
    expect(first.version).toBe(second.version);
  });

  it('throws GitError when git not found', () => {
    expect(() => resolveGitPath({ pathOverride: '/nonexistent' })).toThrow(GitError);
  });

  it('validates git in a temp directory (not a repo)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'git-test-'));
    try {
      const result = validateGit({ cwd: tmp });
      expect(result.versionOk).toBe(true);
      expect(result.repoOk).toBe(false); // not a git repo
      expect(result.error).toBeDefined();
      expect(result.error?.errorClass).toBe('not-a-repository');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('runs a git command', () => {
    const resolve = resolveGitPath();
    const result = runGitCommand({
      gitPath: resolve.path,
      args: ['--version'],
      cwd: process.cwd(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^git version/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('classifies not-a-repository errors', () => {
    const errorClass = classifyGitError({
      exitCode: 128,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git',
    });
    expect(errorClass).toBe('not-a-repository');
  });

  it('classifies permission denied errors', () => {
    const errorClass = classifyGitError({
      exitCode: 128,
      stderr: 'permission denied: /protected/path',
    });
    expect(errorClass).toBe('sandbox-denied');
  });

  it('classifies network errors', () => {
    const errorClass = classifyGitError({
      exitCode: 128,
      stderr: 'fatal: could not resolve host github.com',
    });
    expect(errorClass).toBe('network-denied');
  });

  it('classifies timeout errors', () => {
    const errorClass = classifyGitError({
      exitCode: 128,
      stderr: 'fatal: timed out',
    });
    expect(errorClass).toBe('timeout');
  });

  it('classifies generic git failures', () => {
    const errorClass = classifyGitError({
      exitCode: 1,
      stderr: 'error: pathspec not found',
    });
    expect(errorClass).toBe('git-failed');
  });
});
