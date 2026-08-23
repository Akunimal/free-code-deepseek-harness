/** States reported by the shell's local backend health indicators. */
export type BackendState = 'unknown' | 'ready' | 'degraded' | 'down'

/**
 * Decide whether a backend transition is user-visible.
 *
 * Teardown transitions are expected while the shell is stopping its owned
 * workers and must not be presented as an outage notification.
 * @param previous - the last state published for the backend.
 * @param state - the newly observed state.
 * @param shuttingDown - whether application teardown has started.
 * @returns true when a native state notification should be emitted.
 */
export function shouldNotifyBackendState(
  previous: BackendState,
  state: Exclude<BackendState, 'unknown'>,
  shuttingDown: boolean,
): boolean {
  if (shuttingDown || previous === state) return false
  // The first observation is part of startup settling. The pool and model
  // catalog can report down/degraded while their workers are still warming;
  // only a transition after an observed state is actionable to the user.
  return previous !== 'unknown'
}
