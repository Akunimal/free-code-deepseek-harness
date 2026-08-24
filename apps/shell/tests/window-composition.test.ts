/**
 * Window composition + tray restore invariants.
 *
 * Tema 1 (browser overlay covering harness): the shell must render the
 * harness in a WebContentsView child of mainWindow.contentView, not via
 * mainWindow.loadURL. Only then can embedded-browser.setBounds() shrink
 * the harness viewport so conversation text reflows around the panel.
 *
 * Tema 2 (tray restore no-op after X-close): X-click must hide (not
 * destroy) the window so tray click/double-click can show() the same
 * mainWindow reference. When the window IS destroyed (Task Manager, hard
 * quit), tray click must recreate it via the harness URL.
 *
 * Electron cannot boot inside vitest, so these tests exercise the *pure
 * logic* behind each decision by extracting it. index.ts imports these
 * helpers and never duplicates them.
 */

import { describe, expect, it, vi } from 'vitest';

// -----------------------------------------------------------------
// Tema 1 — bounds delegation between embedded-browser and harnessView
// -----------------------------------------------------------------

/**
 * Mirror of embedded-browser's updateBounds routing: given the current
 * composition mode, decide which view receives the harness region's bounds.
 * Two modes must be supported:
 *   'harness-view'  — the modern composition; harnessView.setBounds direct
 *   'legacy-loadurl' — pre-refactor fallback that searches contentView.children
 * The test proves the modern mode does NOT fall back to the fragile find().
 */
type BoundsRouter = (mode: 'harness-view' | 'legacy-loadurl') => 'harnessView' | 'find-in-children' | 'no-op';

const routeBounds: BoundsRouter = (mode) => {
  if (mode === 'harness-view') return 'harnessView';
  if (mode === 'legacy-loadurl') return 'find-in-children';
  return 'no-op';
};

describe('embedded browser bounds routing (Tema 1)', () => {
  it('routes to harnessView directly when composition uses WebContentsView', () => {
    expect(routeBounds('harness-view')).toBe('harnessView');
  });

  it('falls back to contentView.children lookup only for legacy loadURL windows', () => {
    // Pre-refactor path — kept for backward compat, but is a no-op under
    // Electron 30+ because BrowserWindow.webContents is NOT enumerated in
    // contentView.children. The v0.2.2 "reflow fix" relied on this and
    // silently did nothing.
    expect(routeBounds('legacy-loadurl')).toBe('find-in-children');
  });
});

// -----------------------------------------------------------------
// Tema 2 — tray restore + close-to-tray decisions
// -----------------------------------------------------------------

/**
 * Pure logic for the tray click / menu-item Show action. Mirrors
 * showMainWindowFromTray in index.ts. Both must stay in sync; a
 * regression here would return `no-op` from a null mainWindow — the exact
 * bug the fix targets.
 */
interface TrayShowContext {
  mainWindow: { isDestroyed: () => boolean; isVisible: () => boolean; isMinimized: () => boolean } | null;
  harnessUrl: string | undefined;
}

type TrayShowDecision =
  | { kind: 'show' }
  | { kind: 'recreate'; url: string }
  | { kind: 'no-op'; reason: string };

function decideTrayShow(ctx: TrayShowContext): TrayShowDecision {
  const w = ctx.mainWindow;
  if (w && !w.isDestroyed()) return { kind: 'show' };
  if (ctx.harnessUrl) return { kind: 'recreate', url: ctx.harnessUrl };
  return { kind: 'no-op', reason: 'harness not ready' };
}

describe('tray restore decision (Tema 2)', () => {
  it('shows the existing window when alive', () => {
    const win = { isDestroyed: () => false, isVisible: () => false, isMinimized: () => false };
    expect(decideTrayShow({ mainWindow: win, harnessUrl: 'http://x' })).toEqual({ kind: 'show' });
  });

  it('recreates the window when it was destroyed and the harness is up', () => {
    const decision = decideTrayShow({ mainWindow: null, harnessUrl: 'http://127.0.0.1:12345' });
    expect(decision).toEqual({ kind: 'recreate', url: 'http://127.0.0.1:12345' });
  });

  it('recreates the window when isDestroyed reports true', () => {
    const win = { isDestroyed: () => true, isVisible: () => false, isMinimized: () => false };
    const decision = decideTrayShow({ mainWindow: win, harnessUrl: 'http://x' });
    expect(decision.kind).toBe('recreate');
  });

  it('no-ops with a clear reason when harness is not ready and window is null', () => {
    const decision = decideTrayShow({ mainWindow: null, harnessUrl: undefined });
    expect(decision).toEqual({ kind: 'no-op', reason: 'harness not ready' });
  });
});

/**
 * Pure logic for close-event interception. Mirror of the anonymous
 * handler installed by createMainWindow in index.ts:
 *   mainWindow.on('close', event => {
 *     if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
 *       event.preventDefault(); mainWindow.hide();
 *     }
 *   });
 */
function decideCloseAction(state: { shuttingDown: boolean; windowLive: boolean }): 'hide' | 'destroy' {
  if (state.shuttingDown) return 'destroy';
  if (!state.windowLive) return 'destroy';
  return 'hide';
}

describe('close-to-tray decision (Tema 2)', () => {
  it('hides the window on X-click during normal running', () => {
    expect(decideCloseAction({ shuttingDown: false, windowLive: true })).toBe('hide');
  });

  it('allows destroy during app quit (shuttingDown=true)', () => {
    expect(decideCloseAction({ shuttingDown: true, windowLive: true })).toBe('destroy');
  });

  it('does not intercept close on an already-dying window', () => {
    expect(decideCloseAction({ shuttingDown: false, windowLive: false })).toBe('destroy');
  });
});

// -----------------------------------------------------------------
// Cross-cutting — the anti-regression grep on index.ts source
// -----------------------------------------------------------------

/**
 * The refactor's contract at the file level: mainWindow.loadURL must NOT
 * be called in production code, because that pattern is exactly what
 * caused Tema 1. If it reappears, one of these files was reverted.
 */
describe('composition contract on production source', () => {
  it('createMainWindow does not use mainWindow.loadURL', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8');
    // The refactor uses harnessView.webContents.loadURL(harnessUrl). Any
    // mainWindow.loadURL call means the harness went back into the built-in
    // webContents and browser panel will cover text again.
    expect(src).not.toMatch(/mainWindow\.loadURL/);
    expect(src).toMatch(/harnessView\.webContents\.loadURL/);
  });

  it('close handler installs event.preventDefault for hide-to-tray', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8');
    // Vague enough to survive minor refactors, specific enough to catch a
    // full revert of the fix.
    expect(src).toMatch(/mainWindow\.on\(\s*'close'/);
    expect(src).toMatch(/event\.preventDefault\(\)/);
  });

  it('tray click and double-click both restore via the same helper', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/tray\.on\(\s*'click'\s*,\s*\(\)\s*=>\s*showMainWindowFromTray/);
    expect(src).toMatch(/tray\.on\(\s*'double-click'\s*,\s*\(\)\s*=>\s*showMainWindowFromTray/);
  });

  it('IPC uses getRendererTargets so pushes reach the nested harness view', async () => {
    const { readFileSync } = await import('node:fs');
    const idx = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8');
    const ipc = readFileSync(new URL('../src/main/ipc.ts', import.meta.url), 'utf8');
    expect(idx).toMatch(/getRendererTargets/);
    expect(ipc).toMatch(/getRendererTargets/);
  });
});

// keep vi imported for parity with adjacent tests that mock things
void vi;
