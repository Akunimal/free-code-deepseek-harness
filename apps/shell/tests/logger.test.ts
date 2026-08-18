import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppLogger } from '../src/main/logger.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('rotating app logger', () => {
  it('writes JSON lines and rotates bounded files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'freecode-logs-'));
    dirs.push(dir);
    const app = createAppLogger(dir, { maxBytes: 1_024, maxFiles: 2 });
    for (let i = 0; i < 100; i++) app.logger.info({ i, feature: 'test' }, 'event');
    await app.close();
    const names = readdirSync(dir).filter((name) => name.startsWith('app.log'));
    expect(names.length).toBeLessThanOrEqual(3);
    expect(existsSync(join(dir, 'app.log'))).toBe(true);
    const line = readFileSync(join(dir, 'app.log'), 'utf8').trim().split(/\r?\n/).at(-1);
    expect(JSON.parse(line!)).toMatchObject({ msg: 'event', feature: 'test' });
  });
});
