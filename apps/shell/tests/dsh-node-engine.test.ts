import { describe, expect, it } from 'vitest';

describe('DSH Node engine compatibility policy', () => {
  it('fails closed on invalid Node versions or engine declarations', async () => {
    const modulePath = new URL('../../../scripts/verify-dsh-node-engine.mjs', import.meta.url).href;
    const policy = await import(modulePath) as {
      nodeVersionSatisfiesEngine: (version: string, range: string) => boolean;
    };

    expect(policy.nodeVersionSatisfiesEngine('v22.16.0', '^22.19.0 || >=24.0.0')).toBe(false);
    expect(policy.nodeVersionSatisfiesEngine('v22.19.0', '^22.19.0 || >=24.0.0')).toBe(true);
    expect(policy.nodeVersionSatisfiesEngine('v24.21.0', '^22.19.0 || >=24.0.0')).toBe(true);
    expect(policy.nodeVersionSatisfiesEngine('not-a-version', '>=24.0.0')).toBe(false);
    expect(policy.nodeVersionSatisfiesEngine('v24.21.0', 'invalid-range')).toBe(false);
  });
});
