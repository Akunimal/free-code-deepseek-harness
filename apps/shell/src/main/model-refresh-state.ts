import type { ModelCatalogRefreshState } from '@freecode/shared-types';

export interface ModelCatalogRefreshStateStore {
  get(): ModelCatalogRefreshState;
  subscribe(listener: (state: ModelCatalogRefreshState) => void): () => void;
  run<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Owns a revisioned view of the shell's catalog refresh lifecycle. Keeping
 * this outside the renderer lets the preload return the current snapshot even
 * when startup refresh began before the Harness page mounted.
 */
export function createModelCatalogRefreshState(): ModelCatalogRefreshStateStore {
  let state: ModelCatalogRefreshState = { revision: 0, status: 'idle', startedAt: null };
  let activeRuns = 0;
  const listeners = new Set<(value: ModelCatalogRefreshState) => void>();

  const publish = (status: ModelCatalogRefreshState['status']): void => {
    state = {
      revision: state.revision + 1,
      status,
      startedAt: status === 'loading' ? Date.now() : null,
    };
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        // A disconnected renderer must not prevent the refresh itself from running.
      }
    }
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async run<T>(operation: () => Promise<T>): Promise<T> {
      activeRuns += 1;
      if (activeRuns === 1) publish('loading');
      try {
        return await operation();
      } finally {
        activeRuns -= 1;
        if (activeRuns === 0) publish('idle');
      }
    },
  };
}

export interface RefreshHold {
  /** Hold the store in `loading` until released (idempotent). */
  hold(): void;
  /** Release a held `loading` state (no-op when not held). */
  release(): void;
  readonly held: boolean;
}

/**
 * Keeps the shared refresh state `loading` while work that precedes a catalog
 * refresh (the provider probes) runs, so the selector shows the free
 * models loading instead of an empty list. The timer bounds the hold if the
 * work never reports back.
 */
export function createRefreshHold(store: ModelCatalogRefreshStateStore, timeoutMs: number): RefreshHold {
  let release: (() => void) | null = null;
  return {
    hold() {
      if (release !== null) return;
      let resolveHold: () => void = () => undefined;
      const pending = new Promise<void>((resolve) => { resolveHold = () => resolve(); });
      void store.run(() => pending);
      const timer = setTimeout(() => release?.(), timeoutMs);
      timer.unref?.();
      release = () => {
        clearTimeout(timer);
        release = null;
        resolveHold();
      };
    },
    release() {
      release?.();
    },
    get held() {
      return release !== null;
    },
  };
}
