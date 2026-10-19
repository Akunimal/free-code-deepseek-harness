import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModelCatalogRefreshState, createRefreshHold } from '../src/main/model-refresh-state.js';

afterEach(() => { vi.useRealTimers(); });

describe('createRefreshHold', () => {
  it('keeps the selector loading during a proxy harvest and releases once', async () => {
    const store = createModelCatalogRefreshState();
    const hold = createRefreshHold(store, 60_000);
    hold.hold();
    hold.hold(); // idempotent: one loading period, not two
    expect(store.get().status).toBe('loading');
    expect(hold.held).toBe(true);
    hold.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.get().status).toBe('idle');
    expect(hold.held).toBe(false);
    hold.release(); // no-op
  });

  it('stays loading while a catalog refresh started before the hold was released', async () => {
    const store = createModelCatalogRefreshState();
    const hold = createRefreshHold(store, 60_000);
    hold.hold();
    let finishRefresh: () => void = () => undefined;
    const refresh = store.run(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));
    hold.release();
    await Promise.resolve();
    expect(store.get().status).toBe('loading');
    finishRefresh();
    await refresh;
    expect(store.get().status).toBe('idle');
  });

  it('releases on its own when the harvest never reports back', async () => {
    vi.useFakeTimers();
    const store = createModelCatalogRefreshState();
    const hold = createRefreshHold(store, 1_000);
    hold.hold();
    await vi.advanceTimersByTimeAsync(1_001);
    expect(store.get().status).toBe('idle');
    expect(hold.held).toBe(false);
  });
});
