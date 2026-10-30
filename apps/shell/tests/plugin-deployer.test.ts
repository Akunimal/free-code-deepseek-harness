import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployOurFreeModelPlugin } from '../src/main/plugin-deployer.js';

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

describe('plugin deployer', () => {
  it('deploys dsh-our-free-model to runtime and profile node_modules, updating profile bundles', () => {
    const resourcesDir = createTempDir('res-');
    const harnessRuntimeDir = createTempDir('runtime-');
    const userDataDir = createTempDir('userdata-');

    const pluginSrc = join(resourcesDir, 'plugins', 'dsh-our-free-model');
    mkdirSync(pluginSrc, { recursive: true });
    writeFileSync(join(pluginSrc, 'package.json'), JSON.stringify({ name: 'dsh-our-free-model', version: '2.7.3' }));
    writeFileSync(join(pluginSrc, 'index.js'), 'export default {}');

    mkdirSync(join(harnessRuntimeDir, 'dsh'), { recursive: true });

    const deployed = deployOurFreeModelPlugin({
      resourcesDir,
      harnessRuntimeDir,
      userDataDir,
    });

    expect(deployed).toBe(true);

    // Verify deployed to runtime node_modules
    expect(existsSync(join(harnessRuntimeDir, 'dsh', 'node_modules', 'dsh-our-free-model', 'package.json'))).toBe(true);
    // Verify deployed to profile node_modules
    expect(existsSync(join(userDataDir, 'dsh-home', 'profiles', 'web', 'node_modules', 'dsh-our-free-model', 'package.json'))).toBe(true);

    // Verify profile package.json has bundles
    const pkg = JSON.parse(readFileSync(join(userDataDir, 'dsh-home', 'profiles', 'web', 'package.json'), 'utf8'));
    expect(pkg.dsh.profile.bundles).toContain('dsh-our-free-model');
    expect(pkg.dependencies['dsh-our-free-model']).toBe('^2.7.3');
  });

  it('sanitizes legacy session projections from retired phoenix routes', () => {
    const resourcesDir = createTempDir('res-');
    const harnessRuntimeDir = createTempDir('runtime-');
    const userDataDir = createTempDir('userdata-');

    const pluginSrc = join(resourcesDir, 'plugins', 'dsh-our-free-model');
    mkdirSync(pluginSrc, { recursive: true });
    writeFileSync(join(pluginSrc, 'package.json'), JSON.stringify({ name: 'dsh-our-free-model', version: '2.7.3' }));

    const sessionDir = join(userDataDir, 'dsh-home', 'storages', 'session_projcache', 'sessions');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'session-test.json'), JSON.stringify({
      agent: {
        selection: {
          current: { provider: 'freecode-phoenix', model: 'freeai/deepseek-r1' },
        },
      },
    }));

    deployOurFreeModelPlugin({
      resourcesDir,
      harnessRuntimeDir,
      userDataDir,
    });

    const sanitized = JSON.parse(readFileSync(join(sessionDir, 'session-test.json'), 'utf8'));
    expect(sanitized.agent.selection.current.provider).toBe('our-free-model');
    expect(sanitized.agent.selection.current.model).toBe('deepseek-v4.1-flash-free');
  });
});
