import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headlessHostSourceDigest, verifyHeadlessHost } from './build-headless-host.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Run actual window/process tests against this exact staged or packaged helper. */
export async function verifyHeadlessDesktop(resourcesDir = resolve(root, 'apps/shell/resources/freecode')) {
  if (process.platform !== 'win32') throw new Error('Native Windows desktop containment smoke must run on Windows');
  const helper = await verifyHeadlessHost(resourcesDir, headlessHostSourceDigest());
  const result = spawnSync('go', ['test', '.', '-count=1', '-timeout', '90s'], {
    cwd: resolve(root, 'apps/shell/native/headless-host'), windowsHide: true, shell: false,
    encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, FREECODE_HEADLESS_HOST_UNDER_TEST: helper.executable,
      GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off', CGO_ENABLED: '0' },
  });
  if (result.error || result.status !== 0) throw new Error(`Native desktop containment smoke failed: ${result.error?.message ?? result.stderr}\n${result.stdout}`);
  console.log(`headless-desktop: PASS — exact helper ${helper.executable}; visible-window/descendant, Job teardown, scope, stdio, argv, cwd and env tests`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyHeadlessDesktop(process.argv[2] ? resolve(process.argv[2]) : undefined);
}
