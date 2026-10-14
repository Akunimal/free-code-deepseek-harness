import { gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateOmniRouteArchive } from '../src/main/runtime-archive.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('OmniRoute archive safety before extraction', () => {
  it('accepts ordinary files and safe PAX paths', async () => {
    const pax = paxRecord('LIBARCHIVE.creationtime', '1791930000.123')
      + paxRecord('path', 'node_modules/omniroute/dist/server.js');
    await expect(check([
      entry('runtime-manifest.json', '{}'), entry('PaxHeader', pax, 'x'), entry('ignored-name', '// server'),
    ])).resolves.toBeGreaterThan(0);
  });

  it.each(['../escape', '/absolute', 'C:/escape', 'node_modules/../../escape',
    'node_modules\\escape', 'node_modules/file:stream', 'node_modules/NUL', 'unknown/file'])
  ('rejects an unsafe install path: %s', async (path) => {
    await expect(check([entry(path, 'bad')])).rejects.toThrow(/path|root/i);
  });

  it.each(['1', '2'])('rejects link entries before tar can follow them (%s)', async (type) => {
    await expect(check([entry('node_modules/link', '', type)])).rejects.toThrow(/link|type/i);
  });

  it('validates PAX path overrides, not just the displayed header name', async () => {
    await expect(check([entry('PaxHeader', paxRecord('path', '../escape'), 'x'), entry('safe-name', 'bad')]))
      .rejects.toThrow(/path/i);
  });

  it('rejects sparse-file metadata that native tar could expand beyond the inspected size', async () => {
    await expect(check([entry('PaxHeader', paxRecord('GNU.sparse.realsize', '99999999999'), 'x'),
      entry('node_modules/file', 'x')])).rejects.toThrow(/metadata|sparse/i);
  });

  it('rejects checksum corruption, truncation, and excessive expanded data', async () => {
    const bad = entry('runtime-manifest.json', '{}');
    bad[0] = 99;
    await expect(check([bad])).rejects.toThrow(/checksum/i);
    const root = mkdtempSync(join(tmpdir(), 'freecode-tar-truncated-'));
    roots.push(root);
    const path = join(root, 'bad.tar.gz');
    writeFileSync(path, gzipSync(entry('runtime-manifest.json', '{}').subarray(0, 514)));
    await expect(validateOmniRouteArchive(path)).rejects.toThrow(/truncated/i);
    await expect(check([entry('runtime-manifest.json', 'x'.repeat(4096))], 2048)).rejects.toThrow(/limit/i);
  });
});

async function check(entries: Buffer[], maxBytes?: number): Promise<number> {
  const root = mkdtempSync(join(tmpdir(), 'freecode-tar-validation-'));
  roots.push(root);
  const path = join(root, 'runtime.tar.gz');
  writeFileSync(path, gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])));
  return validateOmniRouteArchive(path, maxBytes);
}

function entry(name: string, text: string, type = '0'): Buffer {
  const header = Buffer.alloc(512);
  const body = Buffer.from(text);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8);
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124, 12);
  header.fill(32, 148, 156);
  header.write(type, 156, 1);
  header.write('ustar\0', 257, 6);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512)]);
}

function paxRecord(key: string, value: string): string {
  const payload = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(payload) + 1;
  while (String(length).length + Buffer.byteLength(payload) !== length) {
    length = String(length).length + Buffer.byteLength(payload);
  }
  return `${length}${payload}`;
}
