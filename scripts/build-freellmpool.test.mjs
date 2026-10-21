import assert from 'node:assert/strict';
import test from 'node:test';
import { createPyInstallerArgs } from './build-freellmpool.mjs';

test('FreeLLMpool bundle follows static imports instead of collecting optional modules', () => {
  const args = createPyInstallerArgs({
    vendor: 'vendor/freellmpool',
    source: 'apps/shell/resources/phoenix',
    tempDir: 'temp',
  });

  assert.ok(!args.includes('--collect-all'), 'optional FreeLLMpool modules must not be bundled wholesale');
  assert.ok(!args.includes('freellmpool'));
  assert.ok(args.includes('--collect-data'));
  assert.ok(args.includes('certifi'));
});

test('FreeLLMpool bundle carries its curated provider catalog as one data file', () => {
  const args = createPyInstallerArgs({
    vendor: 'vendor/freellmpool',
    source: 'apps/shell/resources/phoenix',
    tempDir: 'temp',
  });

  const dataArg = args[args.indexOf('--add-data') + 1];
  assert.match(dataArg, /phoenix-providers\.toml/);
  assert.match(dataArg, /;\.$/);
});
