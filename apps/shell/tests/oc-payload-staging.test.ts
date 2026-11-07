import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

describe('oc-gateway payload staging', () => {
  const root = join(__dirname, '../resources/freecode');

  it('contains opencode2api-win-x64.exe v1.4.7 with valid receipt', () => {
    const bin = join(root, 'opencode2api/opencode2api-win-x64.exe');
    expect(existsSync(bin)).toBe(true);
    const receiptPath = join(root, 'opencode2api/freecode-build-receipt.json');
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    expect(receipt.version).toBe('1.4.7');
    const hash = createHash('sha256').update(readFileSync(bin)).digest('hex');
    expect(hash.toLowerCase()).toBe(receipt.sha256.toLowerCase());
  });

  it('contains required proxy scripts', () => {
    const scripts = ['proxy.js', 'chat-coordinator.js', 'chat-upstream.js', 'mimo-sanitizer.js', 'runtime-config.js'];
    for (const s of scripts) {
      expect(existsSync(join(root, 'oc-gateway/scripts', s))).toBe(true);
    }
  });

  it('contains models catalog', () => {
    expect(existsSync(join(root, 'oc-gateway/config/models.json'))).toBe(true);
  });
});
