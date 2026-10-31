import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('proxy transparent fallback model rotation', () => {
  it('includes FALLBACK_CHAIN with mimo-v2.6-flash-free in proxy.js', () => {
    const proxyScriptPath = join(__dirname, '../resources/freecode/oc-gateway/scripts/proxy.js');
    const content = readFileSync(proxyScriptPath, 'utf8');
    expect(content).toContain('FALLBACK_CHAIN');
    expect(content).toContain('mimo-v2.6-flash-free');
    expect(content).toContain('[MODEL ROTATION] Switching from');
  });
});
