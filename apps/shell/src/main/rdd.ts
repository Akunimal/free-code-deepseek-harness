/**
 * rdd.ts — In-harness enforcement of Gentle AI review discipline (RDD v2).
 *
 * Enforces verbatim state transitions: status output followed by START
 * followed by the exact next_transition value. Any deviation is rejected,
 * not advisory. Every decision appends an auditable entry recording input
 * hash, emitted sequence, verdict, and timestamp. The log never contains
 * secrets (inputs are hashed; sequences are verbatim transition tokens).
 */

import { createHash } from 'node:crypto'

// ── Types ────────────────────────────────────────────────────────────

export type RddVerdict = 'accept' | 'reject'

export interface RddValidateInput {
  statusOutput: string
  startMarker: string | undefined
  nextTransition: string
  expectedNext: string
}

export interface RddValidateResult {
  ok: boolean
  error?: string
}

export interface RddAuditEntry {
  hash: string
  sequence: string[]
  verdict: RddVerdict
  time: string
  reason?: string
}

// ── In-memory audit log (process-local; surfaced via getRddAuditLog) ──

const auditLog: RddAuditEntry[] = []

function hashInput(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16)
}

/**
 * Validate an RDD v2 transition verbatim.
 * - statusOutput must be a non-empty string (status step emitted)
 * - startMarker must be exactly 'START' (single marker between status and next)
 * - nextTransition must equal expectedNext exactly (no paraphrase/reorder)
 */
export function validateRddTransition(input: RddValidateInput): RddValidateResult {
  if (!input.statusOutput || input.statusOutput.trim().length === 0) {
    return { ok: false, error: 'RDD v2: missing status output before START' }
  }
  if (input.startMarker !== 'START') {
    return { ok: false, error: 'RDD v2: missing START marker between status and next_transition' }
  }
  if (input.nextTransition !== input.expectedNext) {
    return {
      ok: false,
      error: `RDD v2: next_transition must be verbatim '${input.expectedNext}'`,
    }
  }
  return { ok: true }
}

/**
 * Append an auditable entry. Input text is hashed (never stored raw) so
 * secrets in review bodies cannot leak into the log.
 */
export function appendRddAudit(entry: {
  input: string
  sequence: string[]
  verdict: RddVerdict
  reason?: string
}): RddAuditEntry {
  const record: RddAuditEntry = {
    hash: hashInput(entry.input),
    sequence: [...entry.sequence],
    verdict: entry.verdict,
    time: new Date().toISOString(),
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
  }
  auditLog.push(record)
  return record
}

/** Read-only snapshot of the audit log. */
export function getRddAuditLog(): readonly RddAuditEntry[] {
  return [...auditLog]
}

/** Clear the audit log. Useful for tests. */
export function _clearRddAudit(): void {
  auditLog.length = 0
}
