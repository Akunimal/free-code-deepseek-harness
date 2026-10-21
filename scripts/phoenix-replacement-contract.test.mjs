import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('no active OpenCode2API source, gateway package, or build pipeline remains', () => {
  const retiredPaths = [
    'apps/shell/src/main/opencode2api.ts',
    'apps/shell/src/main/proxy-rotator.ts',
    'apps/shell/tests/opencode2api-proxyfile.test.ts',
    'apps/shell/tests/proxy-rotator.test.ts',
    'scripts/apply-opencode2api-patches.mjs',
    'scripts/apply-opencode2api-patches.test.mjs',
    'scripts/build-opencode2api.sh',
    'scripts/build-opencode2api.test.mjs',
    'scripts/opencode2api-staging.mjs',
    'scripts/opencode2api-staging.test.mjs',
    'vendor/opencode2api',
    'packages/opencode-adapter',
    'patches/opencode2api-developer-role.patch',
    'patches/opencode2api-host-flag.patch',
    'patches/opencode2api-pash-tool-name.patch',
    'patches/opencode2api-public-model-fallback.patch',
  ];
  const stillPresent = retiredPaths.filter((path) => existsSync(new URL(path, root)));
  assert.deepEqual(stillPresent, [], `retired gateway artifacts remain active: ${stillPresent.join(', ')}`);
});

test('the app packages and verifies only the pinned Phoenix FreeLLMpool gateway', () => {
  const runtimeDeps = JSON.parse(read('apps/shell/resources/runtime-deps.json'));
  const phoenix = runtimeDeps.dependencies.find((dependency) => dependency.id === 'phoenix');
  const packageConfig = read('apps/shell/electron-builder.yml');
  const shellPackage = JSON.parse(read('apps/shell/package.json'));
  const rootPackage = JSON.parse(read('package.json'));
  const preflight = read('apps/shell/src/main/preflight.ts');
  const packageRuntime = read('scripts/package-runtime.sh');

  assert.ok(phoenix, 'Phoenix must have a pinned runtime manifest entry');
  assert.equal(phoenix.required, true);
  assert.equal(phoenix.path, 'phoenix/freellmpool-win-x64.exe');
  assert.equal(phoenix.network, true);
  assert.equal(runtimeDeps.dependencies.some((dependency) => dependency.id === 'opencode2api'
    || /opencode2api/i.test(dependency.path ?? '')), false);
  assert.match(packageConfig, /'\*\*\/\*'/);
  assert.match(packageConfig, /'!opencode2api\/\*\*'/);
  assert.match(shellPackage.scripts['prepackage:verify'], /freellmpool-staging\.mjs --verify/);
  assert.doesNotMatch(shellPackage.scripts['prepackage:verify'], /opencode2api/);
  assert.doesNotMatch(JSON.stringify(shellPackage.dependencies), /opencode-adapter/);
  assert.doesNotMatch(rootPackage.scripts.test + rootPackage.scripts['test:contract'], /opencode-adapter/);
  assert.match(preflight, /freellmpool-win-x64\.exe/);
  assert.doesNotMatch(preflight, /opencode2api/);
  assert.match(packageRuntime, /freellmpool-staging\.mjs/);
  assert.doesNotMatch(packageRuntime, /opencode2api-staging\.mjs/);
  assert.match(read('scripts/verify-nsis-install-layout.mjs'), /resources\/freecode\/phoenix\/freellmpool-win-x64\.exe/);
});

test('Linux AppImage release validation refuses an unsupported sidecar architecture', () => {
  const verifier = read('scripts/verify-linux-appimage.mjs');
  assert.match(verifier, /unsupported/i);
  assert.match(verifier, /Windows x64 only/i);
  assert.doesNotMatch(verifier, /opencode2api/i);
});
