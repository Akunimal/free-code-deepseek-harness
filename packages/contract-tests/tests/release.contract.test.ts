import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');

describe('release and runtime packaging contracts', () => {
  it('keeps releases manual and multiplatform packaging available', () => {
    const shellPackage = readFileSync(join(ROOT, 'apps/shell/package.json'), 'utf8');
    const policy = readFileSync(join(ROOT, 'docs/RELEASE-POLICY.md'), 'utf8');
    expect(existsSync(join(ROOT, '.github/workflows/release.yml'))).toBe(false);
    expect(policy).toContain('performed manually');
    expect(policy).toContain('free GitHub Actions quota');
    expect(shellPackage).toContain('electron-builder --config electron-builder.yml --publish never');
  });

  it('keeps README and release descriptions bilingual', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const spanishReadme = readFileSync(join(ROOT, 'README.es.md'), 'utf8');
    const template = readFileSync(join(ROOT, 'docs/RELEASE-NOTES-TEMPLATE.md'), 'utf8');
    const currentNotes = readFileSync(join(ROOT, 'docs/RELEASE-NOTES-v0.2.0.md'), 'utf8');
    expect(readme).toContain('[Leer en español](README.es.md)');
    expect(readme).toMatch(/^## English$/m);
    expect(readme).toMatch(/^## Español$/m);
    expect(readme).toContain('OpenCode Free models');
    expect(readme).toContain('modelos OpenCode Free');
    expect(readme).not.toContain('DeepSeek Free');
    expect(spanishReadme).toContain('modelos OpenCode Free');
    expect(spanishReadme).not.toContain('DeepSeek Free');
    expect(spanishReadme).toContain('[Read this in English](README.md)');
    for (const notes of [template, currentNotes]) {
      expect(notes).toMatch(/^## English$/m);
      expect(notes).toMatch(/^## Español$/m);
      expect(notes).toContain('manually');
      expect(notes).toContain('manualmente');
    }
  });

  it('keeps the desktop bundle and native runtime closure wired together', () => {
    const builder = readFileSync(join(ROOT, 'apps/shell/electron-builder.yml'), 'utf8');
    const runtime = readFileSync(join(ROOT, 'scripts/package-runtime.sh'), 'utf8');
    const materializer = readFileSync(join(ROOT, 'scripts/materialize-runtime.mjs'), 'utf8');
    const icon = readFileSync(join(ROOT, 'apps/shell/build/icon.ico'));
    const pngIcon = readFileSync(join(ROOT, 'apps/shell/build/icon.png'));
    expect(builder).toContain('appId: com.freecode.deepseekharness');
    expect(builder).toContain('from: resources/freecode');
    expect(builder).toContain('icon: build/icon.png');
    expect(builder).toContain('  icon: build/icon.ico');
    expect(pngIcon.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(pngIcon.readUInt32BE(16)).toBeGreaterThanOrEqual(512);
    expect(pngIcon.readUInt32BE(20)).toBeGreaterThanOrEqual(512);
    expect(builder).toContain('- portable');
    expect(builder).toContain('artifactName: FreeCode-DeepSeek-Harness-${version}-${os}-${arch}-portable.${ext}');
    expect(builder).toContain('owner: Akunimal');
    expect(builder).toContain('repo: free-code-deepseek-harness');
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    const icoEntryCount = icon.readUInt16LE(4);
    expect(icoEntryCount).toBeGreaterThanOrEqual(1);
    const has256 = Array.from({ length: icoEntryCount }, (_, i) => icon[6 + i * 16]).some(w => w === 0);
    expect(has256).toBe(true); // At least one 256px entry (width byte 0 = 256).
    expect(runtime).toContain('--node-linker=hoisted');
    expect(runtime).toContain('upstreamCommit');
    expect(runtime).toContain('git-subtree-split');
    expect(runtime).toContain('materialize-runtime.mjs');
    expect(runtime).not.toContain('--exclude=native');
    expect(materializer).toContain("'native'");
    expect(materializer).toContain("entry.name === '.bin'");
  });

  it('keeps the FreeCode browser, update indicator, and naming contracts aligned', () => {
    const browser = readFileSync(join(ROOT, 'apps/shell/src/main/embedded-browser.ts'), 'utf8');
    const shell = readFileSync(join(ROOT, 'apps/shell/src/main/index.ts'), 'utf8');
    const browserTool = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/web/tool-web/src/browser.ts'), 'utf8');
    const sidebar = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/client/ui-sidebar/src/client/SidebarRoot.tsx'), 'utf8');
    const compaction = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/compaction/compaction-basic/src/config.ts'), 'utf8');
    const rtk = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/shell/bash-local/src/rtk.ts'), 'utf8');
    expect(browser).toContain('new WebContentsView');
    expect(browser).toContain('session.fromPath');
    expect(browser).toContain('browser-state.json');
    expect(browser).toContain('contentView.addChildView');
    expect(browser).not.toContain('new BrowserWindow');
    expect(browserTool).toContain("'tabs'");
    expect(browserTool).toContain("'new_tab'");
    expect(browserTool).toContain('computer_use');
    expect(sidebar).toContain('fallbackBrandName}>FreeCode');
    expect(shell).toContain('setInterval(() => void checkForUpdates()');
    expect(shell).toContain('freecode://updates/open');
    expect(shell).not.toContain("t('menu.checkUpdates')");
    expect(compaction).toContain('DEFAULT_THRESHOLD_RATIO = 0.75');
    expect(rtk).toContain('spawnSync');
    expect(rtk).toContain('return false');
  });
});
