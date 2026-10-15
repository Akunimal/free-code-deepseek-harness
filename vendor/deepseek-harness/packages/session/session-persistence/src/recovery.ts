/** Read-only recovery metadata shared by Host and Client, without service declarations. */
export interface SessionHandleReadRecovery {
  /** Recovery never rewrites the original artifact. */
  readonly kind: 'invalid-tail'
  /** First event omitted from the returned contiguous prefix. */
  readonly firstInvalidSeq: number
  /** Complete event rows omitted from the returned suffix. */
  readonly discardedEvents: number
  /** Bounded released-format diagnostic for logs and UI surfaces. */
  readonly reason: string
}
