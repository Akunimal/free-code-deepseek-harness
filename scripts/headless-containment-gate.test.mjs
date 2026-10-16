import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyProcessLaunchInventory } from './verify-process-launch-inventory.mjs';

test('build, package and release run native containment behavior, not only string checks', () => {
  const shell = JSON.parse(readFileSync(new URL('../apps/shell/package.json', import.meta.url), 'utf8'));
  assert.match(shell.scripts.build, /build-headless-host\.mjs/);
  assert.match(shell.scripts.test, /build-headless-host\.mjs/);
  assert.match(shell.scripts['prepackage:verify'], /verify-headless-desktop\.mjs/);
  const afterPack = readFileSync(new URL('../apps/shell/build/verify-packaged-electron.cjs', import.meta.url), 'utf8');
  assert.match(afterPack, /verifyHeadlessDesktop/);
  assert.match(afterPack, /context\.appOutDir/);
  assert.match(readFileSync(new URL('./release-gate-plan.mjs', import.meta.url), 'utf8'), /headless-desktop-native-smoke/);
});

test('shell source inventory rejects new direct background spawn bypasses', t => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-headless-inventory-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['apps/shell/src', 'vendor/deepseek-harness/apps/desktop/src', 'vendor/deepseek-harness/packages']) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFileSync(join(root, 'apps/shell/src/bypass.ts'), "import {spawn} from 'node:child_process'; spawn('pwsh.exe', [], {windowsHide:true});");
  assert.ok(verifyProcessLaunchInventory(root).failures.some(message => message.includes('bypasses the required native headless host')));
});
