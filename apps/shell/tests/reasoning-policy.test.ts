import { describe, expect, it } from 'vitest';
import { compatForModel, reasoningEffortsForModel, reasoningEffortsForModelWithHint } from '../src/main/reasoning-policy.js';

describe('reasoning policy', () => {
  it('advertises MiMo V2.5 as an on/off thinking model', () => {
    expect(reasoningEffortsForModel('mimo-v2.5')).toEqual({ off: null, high: 'high' });
    expect(reasoningEffortsForModel('mimo-v2.5-pro')).toEqual({ off: null, high: 'high' });
    expect(compatForModel('mimo-v2.5')).toEqual({
      thinkingFormat: 'deepseek',
      supportsReasoningEffort: false,
    });
  });

  it('offers generic effort only with gateway reasoning evidence', () => {
    expect(reasoningEffortsForModelWithHint('space-bunny-free', true)).toEqual({
      off: null,
      low: 'low',
      high: 'high',
    });
    expect(reasoningEffortsForModelWithHint('space-bunny-free', false)).toBe(false);
    expect(reasoningEffortsForModelWithHint('space-bunny-free', undefined)).toBe(false);
    // Name policy still wins over evidence for known dialects.
    expect(reasoningEffortsForModelWithHint('mimo-v2.6-flash-free', true)).toEqual({ off: null, high: 'high' });
    expect(reasoningEffortsForModelWithHint('deepseek-v4-flash', true)).toEqual({
      off: null,
      low: 'low',
      high: 'high',
      max: 'max',
    });
  });

  it('does not attach MiMo-only wire overrides to unrelated models', () => {
    expect(compatForModel('deepseek-v3.2-free')).toBeUndefined();
    expect(reasoningEffortsForModel('deepseek-v3.2-free')).toEqual({
      off: null,
      low: 'low',
      high: 'high',
      max: 'max',
    });
  });
});
