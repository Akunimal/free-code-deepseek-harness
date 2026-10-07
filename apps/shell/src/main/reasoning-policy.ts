/**
 * Reasoning capability policy for the free pool.
 *
 * The pool is heterogeneous: DeepSeek model ids are the only models for which
 * this shell can safely advertise the DeepSeek effort vocabulary. Every other
 * model is explicitly marked as non-reasoning so stale route/default settings
 * cannot make the harness send an unsupported effort.
 *
 * MiMo-V2.5 is a binary thinking API on its OpenAI-compatible chat endpoint:
 * `thinking.type` is either `enabled` or `disabled`; it does not consume a
 * tunable `reasoning_effort` value. We therefore expose only the meaningful
 * off/on pair for MiMo instead of presenting low/high as different strengths.
 * Other thinking-capable gateways keep the generic low/high vocabulary until
 * their own wire contract says otherwise.
 */

export type ModelReasoningEfforts = false | {
  off: null;
  low?: 'low';
  high: 'high';
  max?: 'max';
};

const DEEPSEEK_REASONING_EFFORTS: Exclude<ModelReasoningEfforts, false> = {
  off: null,
  low: 'low',
  high: 'high',
  max: 'max',
};

const MIMO_REASONING_EFFORTS: Exclude<ModelReasoningEfforts, false> = {
  off: null,
  high: 'high',
};

/** Generic graduated thinking for models whose gateway metadata advertises
 *  reasoning but whose wire dialect is not DeepSeek/MiMo-specific.
 *  Verified live against the opencode2api lane: reasoning_effort passes
 *  through and is honored (200 + reasoning_content observed). Effort only
 *  reaches the wire when the user selects a non-off level. */
const GENERIC_REASONING_EFFORTS: Exclude<ModelReasoningEfforts, false> = {
  off: null,
  low: 'low',
  high: 'high',
};

/** Models that support extended thinking but are NOT DeepSeek.
 *  These use a reduced vocabulary (off/low/high — no max tier). */
const THINKING_CAPABLE_MODELS: readonly RegExp[] = [
  /^qwen.*think/i,
];

/** MiMo's OpenAI-compatible chat API has an enabled/disabled thinking switch. */
export function isMimoModel(modelId: unknown): modelId is string {
  return typeof modelId === 'string' && /^mimo(?:-|$)/i.test(modelId);
}

function isThinkingCapableModel(modelId: string): boolean {
  return THINKING_CAPABLE_MODELS.some((re) => re.test(modelId));
}

/** Return the exact reasoning declaration safe for one pool model id. */
export function reasoningEffortsForModel(modelId: string): ModelReasoningEfforts {
  return reasoningEffortsForModelWithHint(modelId, undefined);
}

/**
 * Name policy plus live gateway evidence. `gatewayReasoning` is the
 * per-model `reasoning` flag from the gateway catalog metadata (true when
 * the serving lane advertises thinking for the id). Unknown/absent evidence
 * keeps the conservative name-only verdict.
 */
export function reasoningEffortsForModelWithHint(
  modelId: string,
  gatewayReasoning: boolean | undefined,
): ModelReasoningEfforts {
  if (isDeepSeekModel(modelId)) return { ...DEEPSEEK_REASONING_EFFORTS };
  if (isMimoModel(modelId)) return { ...MIMO_REASONING_EFFORTS };
  if (isThinkingCapableModel(modelId)) {
    return { off: null, low: 'low', high: 'high' };
  }
  if (gatewayReasoning === true) return { ...GENERIC_REASONING_EFFORTS };
  return false;
}

/**
 * Per-model wire overrides needed when one OpenAI-compatible route serves
 * multiple vendor dialects. MiMo consumes `thinking.type`, not
 * `reasoning_effort`; the catalog resolver selects the DeepSeek wire dialect
 * so pi-ai emits `thinking.type`, and suppresses the unused effort field
 * without changing unrelated user compat fields.
 */
export function compatForModel(modelId: string): {
  thinkingFormat: 'deepseek';
  supportsReasoningEffort: false;
} | undefined {
  return isMimoModel(modelId)
    ? { thinkingFormat: 'deepseek', supportsReasoningEffort: false }
    : undefined;
}

/** Identify model ids for which the pool can advertise DeepSeek reasoning. */
export function isDeepSeekModel(modelId: unknown): modelId is string {
  return typeof modelId === 'string' && /^deepseek(?:-|$)/i.test(modelId);
}
