import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureProxyfile } from '../src/main/opencode2api.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function target(): string {
  const dir = mkdtempSync(join(tmpdir(), 'freecode-proxyfile-'));
  roots.push(dir);
  return join(dir, 'opencode2api', 'proxies.txt');
}

describe('ensureProxyfile', () => {
  it('creates an empty proxyfile (direct-only) when it is missing, so the gateway can start', () => {
    const path = target();
    ensureProxyfile(path);
    expect(readFileSync(path, 'utf8')).toBe('');
  });

  it('never overwrites an existing proxyfile written by the rotator', () => {
    const path = target();
    ensureProxyfile(path);
    writeFileSync(path, 'socks5h://1.2.3.4:1080\n', 'utf8');
    ensureProxyfile(path);
    expect(readFileSync(path, 'utf8')).toBe('socks5h://1.2.3.4:1080\n');
  });
});
