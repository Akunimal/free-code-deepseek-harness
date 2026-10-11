import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('sha256File', () => {
  it('hashes an archive from a file stream without loading the complete asset into memory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'freecode-sha256-file-'));
    roots.push(root);
    const bytes = Buffer.alloc(8 * 1024 * 1024, 0x5a);
    const archive = join(root, 'runtime.tar.gz');
    writeFileSync(archive, bytes);
    const expected = createHash('sha256').update(bytes).digest('hex');
    const modulePath = new URL('../../../scripts/sha256-file.mjs', import.meta.url).href;
    const { sha256File } = await import(modulePath) as { sha256File(path: string): Promise<string> };

    await expect(sha256File(archive)).resolves.toBe(expected);
  });
});
