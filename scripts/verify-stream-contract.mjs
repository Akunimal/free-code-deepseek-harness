#!/usr/bin/env node
/**
 * verify-stream-contract.mjs — Phase 7: Verify provider stream and OCR contracts.
 *
 * Checks that the source code enforces:
 *   1. DeepSeek Messages stream must end with message_stop (STREAM_CLOSED on truncation)
 *   2. Empty response (stop with no content) maps to EMPTY_RESPONSE error
 *   3. DeepSeek Messages stop_reason=tool_use maps to tool-calls
 *   4. OCR boundaries: path validation, size limits, timeout, language/PSM allow-list
 *   5. Bounded retry with error class exposure
 *   6. No silent success on incomplete protocol
 *
 * Usage:
 *   node scripts/verify-stream-contract.mjs
 *
 * Exit code 0 = all checks pass. Non-zero = failure.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const VENDOR = join(REPO_ROOT, 'vendor/deepseek-harness');

const checks = [];
function logCheck(name, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  const detailStr = detail ? ` (${detail})` : '';
  console.log(`  [${status}] ${name}${detailStr}`);
  checks.push({ name, pass });
}

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

// ── CHECK 1: Messages translator rejects a truncated stream ─────────

const ssePath = join(VENDOR, 'packages/llm/llm-deepseek/src/sse.ts');
const sseSrc = readFileSafe(ssePath);
const translatePath = join(VENDOR, 'packages/llm/llm-deepseek/src/translate.ts');
const translateSrc = readFileSafe(translatePath);
const streamTestPathForBehavior = join(REPO_ROOT, 'packages/contract-tests/tests/stream.contract.test.ts');
const streamTestSrc = readFileSafe(streamTestPathForBehavior);

logCheck(
  'messages-translator-throws-on-truncation',
  sseSrc !== null
    && sseSrc.includes('message_stop')
    && translateSrc !== null
    && translateSrc.includes('message_stop')
    && translateSrc.includes('STREAM_CLOSED')
    && streamTestSrc !== null
    && streamTestSrc.includes('reports STREAM_CLOSED when a provider ends before message_stop'),
  'Messages translation must throw STREAM_CLOSED if the provider ends before message_stop, with a behavioral regression test',
);

// ── CHECK 2: Translate maps empty response to EMPTY_RESPONSE ────────

logCheck(
  'translate-empty-response-maps-to-error',
  translateSrc !== null
    && translateSrc.includes('EMPTY_RESPONSE')
    && translateSrc.includes('blocks.size === 0')
    && translateSrc.includes("reason.kind === 'stop'")
    && streamTestSrc !== null
    && streamTestSrc.includes('maps max_tokens and reports an empty stop as EMPTY_RESPONSE'),
  'translate must map a stop with no content blocks to EMPTY_RESPONSE and cover it behaviorally',
);

// ── CHECK 3: Messages stop_reason=tool_use maps to tool-calls ───────

logCheck(
  'translate-tool-calls-mapping',
  translateSrc !== null
    && translateSrc.includes("case 'tool_use'")
    && translateSrc.includes("kind: 'tool-calls'")
    && streamTestSrc !== null
    && streamTestSrc.includes('then maps tool_use to tool-calls'),
  'Messages stop_reason tool_use must map to {kind: "tool-calls"} and be covered behaviorally',
);

// ── CHECK 4: pi-ai stream handles done/error/ exhaustion ────────────

const piAiStreamPath = join(VENDOR, 'packages/llm/llm-pi-ai/src/stream.ts');
const piAiSrc = readFileSafe(piAiStreamPath);

logCheck(
  'pi-ai-stream-handles-exhaustion',
  piAiSrc !== null
    && piAiSrc.includes('STREAM_CLOSED')
    && piAiSrc.includes('ended without done/error'),
  'pi-ai stream translator must throw STREAM_CLOSED on premature exhaustion',
);

logCheck(
  'pi-ai-stream-handles-error-event',
  piAiSrc !== null
    && piAiSrc.includes("kind: 'error'")
    && piAiSrc.includes('classifyPiAiError'),
  'pi-ai stream must classify error events with classifyPiAiError',
);

// ── CHECK 5: OCR path validation (absolute paths only) ─────────────

const ocrVendorPath = join(VENDOR, 'packages/llm/llm/src/ocr.ts');
const ocrVendorSrc = readFileSafe(ocrVendorPath);

logCheck(
  'ocr-absolute-path-only',
  ocrVendorSrc !== null
    && ocrVendorSrc.includes('isAbsolute')
    && ocrVendorSrc.includes('absolute'),
  'OCR must reject non-absolute image paths',
);

// ── CHECK 6: OCR size limits ───────────────────────────────────────

logCheck(
  'ocr-size-limits',
  ocrVendorSrc !== null
    && ocrVendorSrc.includes('OCR_MAX_IMAGE_BYTES')
    && ocrVendorSrc.includes('OCR_MAX_OUTPUT_BYTES'),
  'OCR must enforce input (25MB) and output (256KB) size limits',
);

// ── CHECK 7: OCR timeout ───────────────────────────────────────────

logCheck(
  'ocr-timeout-enforced',
  ocrVendorSrc !== null
    && ocrVendorSrc.includes('OCR_TIMEOUT_MS')
    && ocrVendorSrc.includes('timeout'),
  'OCR must enforce timeout (30s default)',
);

// ── CHECK 8: OCR language allow-list ────────────────────────────────

logCheck(
  'ocr-language-allowlist',
  ocrVendorSrc !== null
    && ocrVendorSrc.includes('resolveLanguage')
    && ocrVendorSrc.includes('LANGUAGE_PATTERN')
    && ocrVendorSrc.includes('^[a-z]{3}'),
  'OCR must validate language against 3-letter Tesseract codes',
);

// ── CHECK 9: OCR PSM range check ───────────────────────────────────

logCheck(
  'ocr-psm-range-check',
  ocrVendorSrc !== null
    && ocrVendorSrc.includes('resolvePsm')
    && ocrVendorSrc.includes('value < 0 || value > 13'),
  'OCR must validate PSM is integer 0-13',
);

// ── CHECK 10: OCR shell:false (no shell execution) ─────────────────

logCheck(
  'ocr-no-shell-execution',
  ocrVendorSrc !== null
    && ocrVendorSrc.includes('shell: false'),
  'OCR must spawn Tesseract without shell:true',
);

// ── CHECK 11: OCR hash cache ───────────────────────────────────────

logCheck(
  'ocr-hash-cache-exists',
  ocrVendorSrc !== null
    && ocrVendorSrc.includes('OCR_MAX_CACHE_ENTRIES')
    && ocrVendorSrc.includes('sha256'),
  'OCR must cache results by image hash (64-entry LRU)',
);

// ── CHECK 12: Retry policy is bounded ───────────────────────────────

const retryPolicyPath = join(VENDOR, 'packages/llm/llm/src/retry-policy.ts');
const retrySrc = readFileSafe(retryPolicyPath);

logCheck(
  'retry-policy-bounded',
  retrySrc !== null
    && retrySrc.includes('maxRetries')
    && retrySrc.includes('normal'),
  'Retry policy must support bounded mode with maxRetries',
);

// ── CHECK 13: Retry respects EMPTY_RESPONSE as retryable ────────────

logCheck(
  'retry-covers-empty-response',
  retrySrc !== null
    && retrySrc.includes('EMPTY_RESPONSE'),
  'Retryable codes must include EMPTY_RESPONSE',
);

// ── CHECK 14: Error class exposes failure code ──────────────────────

const errorPath = join(VENDOR, 'packages/llm/llm/src/error.ts');
const errorSrc = readFileSafe(errorPath);
const indexPath = join(VENDOR, 'packages/llm/llm/src/index.ts');
const indexSrc = readFileSafe(indexPath);

logCheck(
  'error-class-has-code',
  errorSrc !== null
    && errorSrc.includes('EMPTY_RESPONSE_CODE')
    && indexSrc !== null
    && indexSrc.includes('class LlmError'),
  'LlmError in index.ts, EMPTY_RESPONSE_CODE in error.ts',
);

// ── CHECK 15: LB retry is bounded ───────────────────────────────────

// The retired OpenCode2API adapter (packages/opencode-adapter/src/lb.ts) is gone.
// The active gateway is the pinned Phoenix FreeLLMpool source; check its bounded
// retry and its post-commit no-retry rule there.
const phoenixClientPath = join(REPO_ROOT, 'vendor/freellmpool/src/freellmpool/client.py');
const phoenixProxyPath = join(REPO_ROOT, 'vendor/freellmpool/src/freellmpool/proxy.py');
const phoenixClientSrc = readFileSafe(phoenixClientPath);
const phoenixProxySrc = readFileSafe(phoenixProxyPath);

logCheck(
  'phoenix-retry-bounded',
  phoenixClientSrc !== null
    && /^_MAX_TRANSPORT_ATTEMPTS = \d+/m.test(phoenixClientSrc)
    && phoenixClientSrc.includes('def _retryable(status: int)')
    && phoenixClientSrc.includes('attempt + 1 < attempt_limit'),
  'Phoenix client must bound transport retries with _MAX_TRANSPORT_ATTEMPTS and gate them on _retryable',
);

// ── CHECK 16: Phoenix enforces post-commit no-retry ────────────────

logCheck(
  'phoenix-post-commit-no-retry',
  phoenixProxySrc !== null
    && phoenixProxySrc.includes('before the HTTP response was committed')
    && phoenixProxySrc.includes('never trigger provider retry'),
  'Phoenix proxy must not retry a provider after the HTTP response is committed',
);

// ── CHECK 17: OCR IPC does not expose binary path ──────────────────

const ipcPath = join(REPO_ROOT, 'apps/shell/src/main/ipc.ts');
const ipcSrc = readFileSafe(ipcPath);

logCheck(
  'ocr-ipc-no-binary-path',
  ipcSrc !== null
    && ipcSrc.includes('binaryPath: null'),
  'OCR IPC must not expose binary path to renderer',
);

// ── CHECK 18: Stream contract tests exist ───────────────────────────

const streamTestPath = join(REPO_ROOT, 'packages/contract-tests/tests/stream.contract.test.ts');
const streamTestExists = existsSync(streamTestPath);

logCheck(
  'stream-contract-tests-exist',
  streamTestExists,
  'packages/contract-tests/tests/stream.contract.test.ts must exist',
);

// ── CHECK 19: OCR contract tests exist ──────────────────────────────

const ocrTestPath = join(REPO_ROOT, 'packages/contract-tests/tests/ocr.contract.test.ts');
const ocrTestExists = existsSync(ocrTestPath);

logCheck(
  'ocr-contract-tests-exist',
  ocrTestExists,
  'packages/contract-tests/tests/ocr.contract.test.ts must exist',
);

// ── Summary ─────────────────────────────────────────────────────────

console.log();
const allPass = checks.every(c => c.pass);
const total = checks.length;
const passed = checks.filter(c => c.pass).length;
console.log(`verify-stream-contract: ${passed}/${total} checks passed`);
console.log(`\n  "result": "${allPass ? 'PASS' : 'FAIL'}"`);
process.exit(allPass ? 0 : 1);
