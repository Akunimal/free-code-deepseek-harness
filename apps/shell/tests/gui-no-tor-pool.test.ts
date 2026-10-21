import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The shell GUI exposes no Tor pool: no Pool Status overlay, no Tor tray
// entries, no Rotate Tor IP menu item, no tor/pool preload bridges, and no
// Tor status IPC. Phoenix exposes the pinned FreeLLMpool catalog without a
// shell-owned proxy-rotation or Tor pool surface.
const root = join(import.meta.dirname, '..');
const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');

describe('shell GUI has no Tor pool surface', () => {
  it('the DSH composer ships no Tor pill (source removed from the vendored client)', () => {
    const vendorUi = join(root, '..', '..', 'vendor', 'deepseek-harness', 'packages', 'client', 'ui-conversation', 'src', 'client');
    expect(existsSync(join(vendorUi, 'input', 'TorPill.tsx'))).toBe(false);
    expect(existsSync(join(vendorUi, 'input', 'TorPill.module.css'))).toBe(false);
    expect(read('../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/apply.ts')).not.toMatch(/TorPill|torPill/);
  });

  it('index.ts drops the Pool Status overlay, Tor tray/menu and Tor proxy wiring', () => {
    const source = read('src/main/index.ts');
    for (const forbidden of [
      /renderOverlayHtml/,
      /openOverlay/,
      /overlayWindow/,
      /torManager/,
      /TorManager/,
      /rotateTor/,
      /torTraySummary/,
      /resolveTorProxyCandidates/,
      /pool-overlay-close/,
      /menu\.poolStatus/,
    ]) {
      expect(source, `index.ts must not match ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('ipc.ts drops tor:* and pool:* handlers', () => {
    const source = read('src/main/ipc.ts');
    for (const forbidden of [
      /torGetStatus/,
      /torStart/,
      /torStop/,
      /torStatus/,
      /poolOverlayClose/,
      /closePoolStatusOverlay/,
      /getTorRendererTargets/,
      /poolStatus/,
      /poolRestartWorker/,
      /poolResize/,
    ]) {
      expect(source, `ipc.ts must not match ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('preload exposes no tor or pool bridge', () => {
    const source = read('src/preload/index.ts');
    expect(source).not.toMatch(/\btor:/);
    expect(source).not.toMatch(/\btor: \{/);
    expect(source).not.toMatch(/\bpool: \{/);
    expect(source).not.toMatch(/poolOverlayClose|torStatus|torGetStatus/);
  });

  it('i18n drops Tor, Pool Status and overlay strings', () => {
    const source = read('src/main/i18n.ts');
    expect(source).not.toMatch(/'tor\./);
    expect(source).not.toMatch(/'tray\.tor/);
    expect(source).not.toMatch(/'menu\.poolStatus'/);
    expect(source).not.toMatch(/'menu\.rotateTor'/);
    expect(source).not.toMatch(/'overlay\./);
  });

  it('the overlay close helper module is removed', () => {
    expect(existsSync(join(root, 'src/main/pool-overlay-close.ts'))).toBe(false);
  });
});
