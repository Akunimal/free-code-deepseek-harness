import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The DSH harness page detects the FreeCode desktop host through the user
// agent of its WebContentsView. The DeepSeek first-run prompt is gated on it.
const root = join(import.meta.dirname, '../../..');

describe('FreeCode desktop marker for the harness page', () => {
  it('sets the FreeCodeDesktop user agent on the harness view before it is added', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8');
    const create = source.indexOf('harnessView = new WebContentsView(');
    const marker = source.indexOf("setUserAgent(`${harnessView.webContents.getUserAgent()} FreeCodeDesktop/");
    const attach = source.indexOf('mainWindow.contentView.addChildView(harnessView);', create);
    expect(create).toBeGreaterThanOrEqual(0);
    expect(marker).toBeGreaterThan(create);
    expect(attach).toBeGreaterThan(marker);
  });

  it('DSH deepseek onboarding gate honours the FreeCode marker in the vendored patch', () => {
    const patch = readFileSync(join(root, 'patches/upstream/181-freecode-desktop-skip-deepseek-onboarding.patch'), 'utf8');
    expect(patch).toContain('FreeCodeDesktop');
    expect(patch).toContain("!('dshDesktop' in globalThis)");
  });
});
