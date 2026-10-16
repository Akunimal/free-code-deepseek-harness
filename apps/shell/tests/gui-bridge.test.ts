import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  shell: { openPath: vi.fn().mockResolvedValue(''), openExternal: vi.fn().mockResolvedValue(undefined), showItemInFolder: vi.fn() },
}));
vi.mock('../src/main/interactive-gui.js', () => ({ launchInteractiveGui: vi.fn().mockResolvedValue(undefined) }));

import { createDialogBridge, type DialogBridge } from '../src/main/dialog-bridge.js';
import { launchInteractiveGui } from '../src/main/interactive-gui.js';
import { shell, dialog } from 'electron';

let bridge: DialogBridge | undefined;
let directory: string | undefined;
afterEach(async () => {
  await bridge?.close(); bridge = undefined;
  if (directory) rmSync(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});

it('keeps picker and explicit GUI actions interactive, token-authenticated and bounded', async () => {
  directory = mkdtempSync(join(tmpdir(), 'freecode-gui-bridge-'));
  bridge = await createDialogBridge(directory);
  const request = (route: string, value: unknown, token = bridge!.token) => fetch(new URL(route, bridge!.endpoint), {
    method: 'POST', headers: { 'x-freecode-dialog-token': token }, body: JSON.stringify(value),
  });
  expect((await request('/launch-gui', {}, 'wrong')).status).toBe(401);
  expect(launchInteractiveGui).not.toHaveBeenCalled();
  expect((await request('/launch-gui', { command: 'test-owned-gui.exe', args: ['a b'] })).status).toBe(200);
  expect(launchInteractiveGui).toHaveBeenCalledWith({ command: 'test-owned-gui.exe', args: ['a b'] });
  expect((await request('/open-directory', { path: directory })).status).toBe(200);
  expect(shell.openPath).toHaveBeenCalledWith(directory);
  expect((await request('/open-directory', { path: 'relative' })).status).toBe(400);
  expect((await request('/pick-directory', {})).status).toBe(200);
  expect(dialog.showOpenDialog).toHaveBeenCalledOnce();
  const document = join(directory, 'document.html');
  writeFileSync(document, '<h1>test-owned</h1>');
  expect((await request('/open-path', { path: document, intent: 'default' })).status).toBe(200);
  expect(shell.openExternal).toHaveBeenCalledOnce();
  expect((await request('/open-path', { path: document, intent: 'reveal' })).status).toBe(200);
  expect(shell.showItemInFolder).toHaveBeenCalledWith(document);
  const script = join(directory, 'test-owned.ps1');
  writeFileSync(script, 'test-owned');
  expect((await request('/open-path', { path: script, intent: 'default' })).status).toBe(403);
  expect((await request('/open-path', { path: script, intent: 'text-editor' })).status).toBe(200);
  expect((await request('/launch-gui', { text: 'x'.repeat(70_000) })).status).toBe(413);
});
