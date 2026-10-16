/** Coalesce concurrent callers onto one promise, then allow a later retry. */
export function createSingleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;

    let shared: Promise<T>;
    shared = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (inFlight === shared) inFlight = null;
      });
    inFlight = shared;
    return shared;
  };
}
