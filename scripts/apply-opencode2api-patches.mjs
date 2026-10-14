import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const currentPatches = ['opencode2api-pash-tool-name.patch'];

// Retired pre-v1 overlays are deliberately not replayed on v1.3.x.
export function applyOpencodePatches(repoRoot, patches = currentPatches.map(name => join(repoRoot, 'patches', name))) {
  const run = args => spawnSync('git', ['-c', 'core.autocrlf=false', 'apply', '--whitespace=error', ...args], {
    cwd: repoRoot, encoding: 'utf8', windowsHide: true,
  });
  return patches.map(patch => {
    const content = readFileSync(patch, 'utf8');
    const paths = [...content.matchAll(/^(?:---|\+\+\+) (.+)$/gm)].map(match => match[1]);
    if (!paths.length || paths.some(path => path !== '/dev/null' &&
      (!/^[ab]\/vendor\/opencode2api\/internal\/(?:gateway|protocol)\/[a-z_]+\.go$/.test(path)))) {
      throw new Error('opencode2api overlay contains a path outside vendor boundary');
    }
    if (run(['--reverse', '--check', patch]).status === 0) return 'already applied';
    const check = run(['--check', patch]);
    if (check.status !== 0) throw new Error('opencode2api overlay source diverged: ' + (check.stderr || check.error || 'git apply failed'));
    const applied = run([patch]);
    if (applied.status !== 0) throw new Error('opencode2api overlay apply failed: ' + (applied.stderr || applied.error));
    return 'applied';
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const status of applyOpencodePatches(root)) console.log('opencode2api overlay: ' + status);
}
