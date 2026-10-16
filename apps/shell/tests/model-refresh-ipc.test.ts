import { afterEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels, type ModelCatalog } from '@freecode/shared-types';
import { createModelCatalogRefreshState } from '../src/main/model-refresh-state.js';
import type { ShellRuntime } from '../src/main/runtime.js';
import { registerIpc } from '../src/main/ipc.js';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => { handlers.set(channel, handler); },
    removeHandler: (channel: string) => { handlers.delete(channel); },
  },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openPath: async () => '' },
}));

const catalog: ModelCatalog = { refreshedAt: 123, providers: {} };

function createBridgeFixture() {
  handlers.clear();
  const catalogRefreshState = createModelCatalogRefreshState();
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const closeRequests: unknown[] = [];
  const target = {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
  };
  const runtime = {
    workers: () => [],
    onMcpStatus: () => () => undefined,
    supervisor: { restart: async () => undefined },
    refreshMcpState: () => ({ configPath: '', servers: [] }),
    resetMcpStatus: () => undefined,
    mcpState: () => ({ configPath: '', servers: [] }),
  } as unknown as ShellRuntime;
  const dispose = registerIpc({
    runtime,
    userDataDir: 'test-data',
    homeDir: 'test-home',
    lbBaseUrl: 'http://127.0.0.1',
    catalogStore: { get: () => catalog },
    catalogRefreshState,
    triggerRefresh: async () => {
      await catalogRefreshState.run(async () => undefined);
      return catalog;
    },
    setLocale: () => undefined,
    closePoolStatusOverlay: (sender) => closeRequests.push(sender),
    getRendererTargets: () => [target] as never,
  });
  return { catalogRefreshState, closeRequests, dispose, sent };
}

afterEach(() => handlers.clear());

describe('model catalog refresh IPC', () => {
  it('returns the current snapshot and pushes loading through completion for a manual refresh', async () => {
    const { catalogRefreshState, dispose, sent } = createBridgeFixture();
    await catalogRefreshState.run(async () => undefined);
    const snapshot = handlers.get(IpcChannels.modelsGetRefreshState);
    expect(snapshot?.()).toEqual({ revision: 2, status: 'idle', startedAt: null });
    sent.length = 0;

    const refresh = handlers.get(IpcChannels.modelsRefresh);
    await expect(refresh?.(undefined)).resolves.toEqual(catalog);
    expect(sent.map(event => event.channel)).toEqual([
      IpcChannels.modelsRefreshState,
      IpcChannels.modelsRefreshState,
      IpcChannels.modelsCatalog,
    ]);
    expect(sent[0]?.payload).toMatchObject({ revision: 3, status: 'loading' });
    expect(sent[1]?.payload).toEqual({ revision: 4, status: 'idle', startedAt: null });

    dispose();
    await catalogRefreshState.run(async () => undefined);
    expect(sent).toHaveLength(3);
    expect(handlers.has(IpcChannels.modelsGetRefreshState)).toBe(false);
  });
});

describe('Pool Status overlay close IPC', () => {
  it('forwards the invoking WebContents to the main-process ownership guard', () => {
    const { closeRequests, dispose } = createBridgeFixture();
    const sender = { id: 'pool-overlay-webcontents' };
    const handler = handlers.get(IpcChannels.poolOverlayClose);

    handler?.({ sender });

    expect(closeRequests).toEqual([sender]);
    dispose();
    expect(handlers.has(IpcChannels.poolOverlayClose)).toBe(false);
  });
});
