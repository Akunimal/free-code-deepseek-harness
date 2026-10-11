import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { findFsExtDirectory } from './runtime-native-modules.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/[A-Za-z]:/, (match) => match.slice(1));
const rebuildNative = join(root, 'scripts', 'rebuild-runtime-native.mjs');

test('fs-ext target detection distinguishes absent and present native source', () => {
  const runtime = mkdtempSync(join(tmpdir(), 'freecode-runtime-native-target-'));
  try {
    assert.equal(findFsExtDirectory(runtime), undefined);

    const fsExt = join(runtime, 'node_modules', 'fs-ext');
    mkdirSync(fsExt, { recursive: true });
    writeFileSync(join(fsExt, 'binding.gyp'), '{}');
    assert.equal(findFsExtDirectory(runtime), fsExt);
  } finally {
    rmSync(runtime, { recursive: true, force: true });
  }
});

test('native rebuild accepts an upstream runtime without the optional fs-ext addon', () => {
  const runtime = mkdtempSync(join(tmpdir(), 'freecode-runtime-native-'));
  try {
    writeFileSync(join(runtime, 'package.json'), JSON.stringify({
      name: 'runtime-native-fixture',
      version: '0.0.0',
      dependencies: {},
    }));

    const result = spawnSync(process.execPath, [rebuildNative, runtime], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        NPM_CONFIG_OFFLINE: 'true',
        npm_config_offline: 'true',
      },
      maxBuffer: 4 * 1024 * 1024,
    });

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /fs-ext.+not present|skipping.+fs-ext/i);
  } finally {
    rmSync(runtime, { recursive: true, force: true });
  }
});
