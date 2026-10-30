import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeAndRetireLegacyPlugins } from '../src/main/plugin-deployer.js';

const tempDirs: string[] = [];
function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('legacy plugin retirement and session sanitization', () => {
  it('unbundles dsh-our-free-model from profile package.json', () => {
    const userDataDir = createTempDir('userdata-');
    const profileDir = join(userDataDir, 'dsh-home', 'profiles', 'web');
    mkdirSync(profileDir, { recursive: true });

    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web',
      dependencies: { 'dsh-our-free-model': '^2.7.3' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-our-free-model'] } },
    }));

    sanitizeAndRetireLegacyPlugins({ userDataDir });

    const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
    expect(pkg.dsh.profile.bundles).not.toContain('dsh-our-free-model');
    expect(pkg.dependencies['dsh-our-free-model']).toBeUndefined();
  });

  it('sanitizes legacy session projections from retired routes to freecode-opencode', () => {
    const userDataDir = createTempDir('userdata-');
    const sessionDir = join(userDataDir, 'dsh-home', 'storages', 'session_projcache', 'sessions');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'session-test.json'), JSON.stringify({
      agent: {
        selection: {
          current: { provider: 'our-free-model', model: 'deepseek-v4.1-flash-free' },
        },
      },
    }));

    sanitizeAndRetireLegacyPlugins({ userDataDir });

    const sanitized = JSON.parse(readFileSync(join(sessionDir, 'session-test.json'), 'utf8'));
    expect(sanitized.agent.selection.current.provider).toBe('freecode-opencode');
    expect(sanitized.agent.selection.current.model).toBe('deepseek-v4.1-flash-free');
  });
});
