import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PluginRetireOptions {
  userDataDir: string;
}

/**
 * Retires legacy bundles (such as dsh-our-free-model or freecode-phoenix) from the DSH web profile,
 * and sanitizes historical session projection caches to point to 'freecode-opencode'
 * with 'deepseek-v4.1-flash-free'.
 */
export function sanitizeAndRetireLegacyPlugins(options: PluginRetireOptions): boolean {
  const profileDir = join(options.userDataDir, 'dsh-home', 'profiles', 'web');
  const pkgJsonPath = join(profileDir, 'package.json');

  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      let modified = false;

      if (pkg.dependencies && pkg.dependencies['dsh-our-free-model']) {
        delete pkg.dependencies['dsh-our-free-model'];
        modified = true;
      }

      if (pkg.dsh?.profile?.bundles && Array.isArray(pkg.dsh.profile.bundles)) {
        const filtered = pkg.dsh.profile.bundles.filter((b: string) => b !== 'dsh-our-free-model');
        if (filtered.length !== pkg.dsh.profile.bundles.length) {
          pkg.dsh.profile.bundles = filtered;
          modified = true;
        }
      }

      if (modified) {
        writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      }
    } catch {
      // Ignore parse/write errors
    }
  }

  // Sanitize legacy session projections so users never get 'model not verified by gateway'
  const sessionsDir = join(options.userDataDir, 'dsh-home', 'storages', 'session_projcache', 'sessions');
  if (existsSync(sessionsDir)) {
    try {
      for (const file of readdirSync(sessionsDir)) {
        if (!file.endsWith('.json')) continue;
        const filePath = join(sessionsDir, file);
        try {
          const content = readFileSync(filePath, 'utf8');
          if (
            content.includes('freecode-phoenix') ||
            content.includes('our-free-model') ||
            content.includes('opencode-free') ||
            content.includes('deepseek-r1')
          ) {
            const sanitized = content
              .replace(
                /"provider":\s*"(?:freecode-phoenix|our-free-model|opencode-free|kilo-free|deepseek-free)"/g,
                '"provider": "freecode-opencode"',
              )
              .replace(
                /"model":\s*"(?:auto|deepseek-r1|freeai\/[^"]+|ovh\/[^"]+|kilo\/[^"]+|pollinations\/[^"]+)"/g,
                '"model": "deepseek-v4.1-flash-free"',
              );
            writeFileSync(filePath, sanitized, 'utf8');
          }
        } catch {
          // ignore single file error
        }
      }
    } catch {
      // ignore readdir error
    }
  }

  return true;
}
