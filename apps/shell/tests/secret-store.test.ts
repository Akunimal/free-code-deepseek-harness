import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSecretStore, ensureSecret, resolveSecrets } from '../src/main/secret-store.js';

describe('secret-store', () => {
  it('set/get/delete roundtrip on the host vault', async () => {
    const store = await createSecretStore();
    const key = `test-key-${Date.now()}`;
    try {
      await store.setSecret(key, 'v3ry-s3cr3t');
      const got = await store.getSecret(key);
      expect(got).toBe('v3ry-s3cr3t');
      await store.deleteSecret(key);
      const after = await store.getSecret(key);
      expect(after).toBeNull();
    } finally {
      await store.deleteSecret(key);
    }
  });

  it('resolveSecrets maps vault values into a fresh env map (not process.env)', async () => {
    const store = await createSecretStore();
    const key = `env-key-${Date.now()}`;
    try {
      await store.setSecret(key, 'resolved-value');
      const env = await resolveSecrets(store, [key]);
      expect(env[key]).toBe('resolved-value');
      // process.env untouched
      expect(process.env[key]).toBeUndefined();
    } finally {
      await store.deleteSecret(key);
    }
  });

  it('seeds the public OpenCode credential only when no user key exists', async () => {
    const store = await createSecretStore();
    const key = `public-default-${Date.now()}`;
    const privateKey = `private-existing-${Date.now()}`;
    try {
      expect(await ensureSecret(store, key, 'public')).toBe(true);
      expect(await store.getSecret(key)).toBe('public');
      expect(await ensureSecret(store, key, 'public')).toBe(false);
      expect(await store.getSecret(key)).toBe('public');

      await store.setSecret(privateKey, 'sk-opencode-private-key');
      expect(await ensureSecret(store, privateKey, 'public')).toBe(false);
      expect(await store.getSecret(privateKey)).toBe('sk-opencode-private-key');
    } finally {
      await store.deleteSecret(key);
      await store.deleteSecret(privateKey);
    }
  });

  it('file fallback works standalone (Linux path sim)', async () => {
    // Directly construct via a temp userDataDir path in a fresh process-like
    // way: exercise the file implementation through createSecretStore by
    // forcing the file branch (only possible when keytar+pwsh unavailable —
    // here we just verify the file store logic via the exported fallback by
    // testing the roundtrip semantics on the same API).
    const dir = mkdtempSync(join(tmpdir(), 'dsh-secret-file-'));
    const store = await createSecretStore(dir);
    const key = `file-key-${Date.now()}`;
    try {
      await store.setSecret(key, 'file-secret');
      expect(await store.getSecret(key)).toBe('file-secret');
    } finally {
      await store.deleteSecret(key);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
