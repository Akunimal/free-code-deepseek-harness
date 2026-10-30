import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PluginDeployerOptions {
  resourcesDir: string;
  harnessRuntimeDir: string;
  userDataDir: string;
}

export function deployOurFreeModelPlugin(options: PluginDeployerOptions): boolean {
  const candidateSources = [
    join(options.resourcesDir, 'plugins', 'dsh-our-free-model'),
    join(options.resourcesDir, 'dsh', 'node_modules', 'dsh-our-free-model'),
  ];
  const source = candidateSources.find(p => existsSync(join(p, 'package.json')));
  if (!source) return false;

  const readPkgVersion = (dir: string): string | null => {
    try {
      return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? null;
    } catch {
      return null;
    }
  };

  const srcVersion = readPkgVersion(source);

  // 1. Target 1: harnessRuntimeDir/dsh/node_modules/dsh-our-free-model
  const runtimeTarget = join(options.harnessRuntimeDir, 'dsh', 'node_modules', 'dsh-our-free-model');
  if (existsSync(join(options.harnessRuntimeDir, 'dsh')) && readPkgVersion(runtimeTarget) !== srcVersion) {
    mkdirSync(runtimeTarget, { recursive: true });
    cpSync(source, runtimeTarget, { recursive: true, force: true });
  }

  // 2. Target 2: userDataDir/dsh-home/profiles/web/node_modules/dsh-our-free-model
  const profileDir = join(options.userDataDir, 'dsh-home', 'profiles', 'web');
  const profileTarget = join(profileDir, 'node_modules', 'dsh-our-free-model');
  if (readPkgVersion(profileTarget) !== srcVersion) {
    mkdirSync(profileTarget, { recursive: true });
    cpSync(source, profileTarget, { recursive: true, force: true });
  }

  // 3. Ensure dsh.profile.bundles in profileDir/package.json contains dsh-our-free-model
  const pkgJsonPath = join(profileDir, 'package.json');
  let pkg: any = {
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  };
  if (existsSync(pkgJsonPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    } catch {}
  }
  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies['dsh-our-free-model'] = srcVersion ? `^${srcVersion}` : '^2.7.3';
  pkg.dsh = pkg.dsh ?? {};
  pkg.dsh.profile = pkg.dsh.profile ?? {};
  const currentBundles: string[] = Array.isArray(pkg.dsh.profile.bundles)
    ? pkg.dsh.profile.bundles
    : ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];
  if (!currentBundles.includes('dsh-our-free-model')) {
    pkg.dsh.profile.bundles = [...currentBundles, 'dsh-our-free-model'];
  }
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // 4. Sanitize legacy session projection cache so old sessions don't remain stuck
  const sessionsDir = join(options.userDataDir, 'dsh-home', 'storages', 'session_projcache', 'sessions');
  if (existsSync(sessionsDir)) {
    try {
      for (const file of readdirSync(sessionsDir)) {
        if (!file.endsWith('.json')) continue;
        const filePath = join(sessionsDir, file);
        try {
          const content = readFileSync(filePath, 'utf8');
          if (content.includes('freecode-phoenix') || content.includes('freecode-opencode') || content.includes('opencode-free')) {
            const sanitized = content
              .replace(/"provider":\s*"(?:freecode-phoenix|freecode-opencode|opencode-free|kilo-free|deepseek-free)"/g, '"provider": "our-free-model"')
              .replace(/"model":\s*"(?:auto|deepseek-r1|freeai\/[^"]+|ovh\/[^"]+|kilo\/[^"]+|pollinations\/[^"]+)"/g, '"model": "deepseek-v4.1-flash-free"');
            writeFileSync(filePath, sanitized, 'utf8');
          }
        } catch {}
      }
    } catch {}
  }

  return true;
}
