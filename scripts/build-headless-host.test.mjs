import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyHeadlessHost } from './build-headless-host.mjs';

test('helper verifier rejects console subsystem and stale/mutated build evidence', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'freecode-headless-verify-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const exe = Buffer.alloc(1024);
  exe.write('MZ'); exe.writeUInt32LE(0x80, 0x3c); exe.write('PE\0\0', 0x80);
  exe.writeUInt16LE(0x8664, 0x84); exe.writeUInt16LE(0x20b, 0x98);
  exe.writeUInt16LE(2, 0xdc);
  const save = (source = 'current') => {
    writeFileSync(join(dir, 'headless-host.exe'), exe);
    writeFileSync(join(dir, 'headless-host.json'), JSON.stringify({
      schemaVersion: 1, source, sha256: createHash('sha256').update(exe).digest('hex'),
    }));
  };
  save();
  await verifyHeadlessHost(dir, 'current');
  exe.writeUInt16LE(3, 0xdc); save();
  await assert.rejects(verifyHeadlessHost(dir, 'current'), /GUI subsystem/);
  exe.writeUInt16LE(2, 0xdc); save('old');
  await assert.rejects(verifyHeadlessHost(dir, 'current'), /source/);
  save(); exe[800] = 99; writeFileSync(join(dir, 'headless-host.exe'), exe);
  await assert.rejects(verifyHeadlessHost(dir, 'current'), /SHA-256/);
});
