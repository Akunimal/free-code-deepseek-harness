import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const remote = process.env.DSH_UPSTREAM_REMOTE ?? 'upstream';
const ref = process.env.DSH_UPSTREAM_REF ?? 'main';
const prefix = process.env.DSH_UPSTREAM_PREFIX ?? 'vendor/deepseek-harness';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function git(args) {
  run('git', args);
}

const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (status.error) throw status.error;
if (status.status !== 0) process.exit(status.status ?? 1);
if (status.stdout.trim()) {
  console.error('update-upstream-local: working tree must be clean before updating');
  process.exit(2);
}

console.log(`update-upstream-local: fetching ${remote}#${ref}`);
git(['fetch', '--no-tags', remote, ref]);
console.log(`update-upstream-local: updating ${prefix}`);
git(['subtree', 'pull', `--prefix=${prefix}`, remote, 'FETCH_HEAD', '--squash', '-m', `chore: sync ${prefix} from ${remote}/${ref}`]);

console.log('update-upstream-local: rebuilding only the DeepSeek Harness runtime');
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['package:runtime']);
console.log('update-upstream-local: Harness runtime update complete; opencode2api and the shell were preserved');
