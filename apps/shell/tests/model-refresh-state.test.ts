import { describe, expect, it } from 'vitest';
import { createModelCatalogRefreshState } from '../src/main/model-refresh-state.js';

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
