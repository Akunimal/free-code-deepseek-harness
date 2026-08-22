/**
 * Reasoning capability policy for the free pool.
 *
 * The pool is heterogeneous: DeepSeek model ids are the only models for which
 * this shell can safely advertise the DeepSeek effort vocabulary. Every other
 * model is explicitly marked as non-reasoning so stale route/default settings
 * cannot make the harness send an unsupported effort.
 */

export type ModelReasoningEfforts = false | {
  off: null;
  low: 'low';
  high: 'high';
  max: 'max';
};

const DEEPSEEK_REASONING_EFFORTS: Exclude<ModelReasoningEfforts, false> = {
  off: null,
  low: 'low',
  high: 'high',
  max: 'max',
};

/** Return the exact reasoning declaration safe for one pool model id. */
export function reasoningEffortsForModel(modelId: string): ModelReasoningEfforts {
  return isDeepSeekModel(modelId)
    ? { ...DEEPSEEK_REASONING_EFFORTS }
    : false;
}

/** Identify model ids for which the pool can advertise DeepSeek reasoning. */
export function isDeepSeekModel(modelId: unknown): modelId is string {
  return typeof modelId === 'string' && /^deepseek(?:-|$)/i.test(modelId);
}
