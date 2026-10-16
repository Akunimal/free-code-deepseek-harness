import { describe, expect, it } from 'vitest';
import { createModelCatalogRefreshState } from '../src/main/model-refresh-state.js';
import { createSingleFlight } from '../src/main/single-flight.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe('model catalog refresh state', () => {
  it('publishes revisioned loading and idle snapshots and always clears after failure', async () => {
    const tracker = createModelCatalogRefreshState();
    const updates: ReturnType<typeof tracker.get>[] = [];
    const unsubscribe = tracker.subscribe(state => updates.push(state));
    const failure = new Error('catalog unavailable');

    await expect(tracker.run(async () => { throw failure })).rejects.toBe(failure);

    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ status: 'loading', revision: 1 });
    expect(updates[0]?.startedAt).toEqual(expect.any(Number));
    expect(updates[1]).toEqual({ status: 'idle', revision: 2, startedAt: null });
    expect(tracker.get()).toEqual(updates[1]);

    unsubscribe();
    await tracker.run(async () => undefined);
    expect(updates).toHaveLength(2);
  });

  it('keeps the loading signal active until every overlapping operation settles', async () => {
    const tracker = createModelCatalogRefreshState();
    const first = deferred();
    const second = deferred();
    const firstRun = tracker.run(() => first.promise);
    const secondRun = tracker.run(() => second.promise);

    expect(tracker.get().status).toBe('loading');
    first.resolve();
    await firstRun;
    expect(tracker.get().status).toBe('loading');
    second.resolve();
    await secondRun;
    expect(tracker.get()).toMatchObject({ status: 'idle', startedAt: null });
  });
});

describe('single-flight async work', () => {
  it('shares the in-flight result with every caller and permits a later refresh', async () => {
    const pending: Array<ReturnType<typeof deferredValue<string>>> = [];
    const operation = () => {
      const next = deferredValue<string>();
      pending.push(next);
      return next.promise;
    };
    const run = createSingleFlight(operation);

    const initial = run();
    const manualRefresh = run();
    expect(manualRefresh).toBe(initial);
    await Promise.resolve();
    expect(pending).toHaveLength(1);

    pending[0]!.resolve('catalog');
    await expect(Promise.all([initial, manualRefresh])).resolves.toEqual(['catalog', 'catalog']);

    const laterRefresh = run();
    await Promise.resolve();
    expect(pending).toHaveLength(2);
    pending[1]!.resolve('new catalog');
    await expect(laterRefresh).resolves.toBe('new catalog');
  });

  it('clears a failed in-flight operation so a retry can run', async () => {
    const pending: Array<ReturnType<typeof deferredValue<string>>> = [];
    const run = createSingleFlight(() => {
      const next = deferredValue<string>();
      pending.push(next);
      return next.promise;
    });

    const failed = run();
    await Promise.resolve();
    pending[0]!.reject(new Error('temporary failure'));
    await expect(failed).rejects.toThrow('temporary failure');

    const retried = run();
    await Promise.resolve();
    expect(pending).toHaveLength(2);
    pending[1]!.resolve('recovered');
    await expect(retried).resolves.toBe('recovered');
  });
});

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
