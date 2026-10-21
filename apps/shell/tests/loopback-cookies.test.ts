import { describe, it, expect, vi } from 'vitest';
import { cleanupStaleLoopbackCookies } from '../src/main/loopback-cookies.js';
import { session } from 'electron';

vi.mock('electron', () => {
  const cookiesList: Array<{ name: string; domain: string; path?: string }> = [
    { name: 'dsh-auth-token-1', domain: '127.0.0.1', path: '/' },
    { name: 'dsh-auth-token-2', domain: 'localhost', path: '/' },
    { name: 'other-cookie', domain: '127.0.0.1', path: '/' },
    { name: 'external', domain: 'github.com', path: '/' },
  ];

  const defaultSession = {
    cookies: {
      get: vi.fn(async ({ domain }: { domain: string }) => {
        return cookiesList.filter(c => c.domain === domain);
      }),
      remove: vi.fn(async (_url: string, name: string) => {
        const idx = cookiesList.findIndex(c => c.name === name);
        if (idx !== -1) cookiesList.splice(idx, 1);
      }),
    },
  };

  return {
    session: {
      defaultSession,
    },
  };
});

describe('cleanupStaleLoopbackCookies', () => {
  it('removes only dsh-auth-* cookies on loopback domains', async () => {
    const removedCount = await cleanupStaleLoopbackCookies();

    expect(removedCount).toBe(2);
    expect(session.defaultSession.cookies.remove).toHaveBeenCalledWith(
      'http://127.0.0.1/',
      'dsh-auth-token-1'
    );
    expect(session.defaultSession.cookies.remove).toHaveBeenCalledWith(
      'http://localhost/',
      'dsh-auth-token-2'
    );
    expect(session.defaultSession.cookies.remove).not.toHaveBeenCalledWith(
      expect.anything(),
      'other-cookie'
    );
    expect(session.defaultSession.cookies.remove).not.toHaveBeenCalledWith(
      expect.anything(),
      'external'
    );
  });
});
