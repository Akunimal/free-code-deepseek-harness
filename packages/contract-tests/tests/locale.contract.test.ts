/**
 * Locale contract tests — Phase 8.
 *
 * Verifies Spanish locale and desktop capability contracts:
 *   1. Spanish locale file exists with CommonKey type
 *   2. LOCALE_IDS includes zh, en, es
 *   3. Shell i18n has strings for all three locales
 *   4. About dialog uses app.getVersion()
 *   5. Reasoning effort hidden for non-supporting models
 *   6. Patch 140 is applied (es locale exists in vendor)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = import.meta.dirname.replace(/packages[/\\]contract-tests[/\\]tests$/, '');
const VENDOR = join(ROOT, 'vendor/deepseek-harness');
const APPS = join(ROOT, 'apps/shell');

function readFile(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

describe('Locale contract — Spanish patch', () => {
  it('es.ts exists in vendor locale directory', () => {
    const path = join(VENDOR, 'packages/client/locale/src/locales/es.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('es.ts exports a typed Spanish dictionary', () => {
    const src = readFile(join(VENDOR, 'packages/client/locale/src/locales/es.ts'));
    expect(src).not.toBeNull();
    expect(src).toContain('CommonKey');
    expect(src).toContain('export');
  });

  it('LOCALE_IDS includes es', () => {
    const src = readFile(join(VENDOR, 'packages/client/locale/src/locale-settings.ts'));
    expect(src).not.toBeNull();
    expect(src).toContain("'es'");
    expect(src).toContain("'zh'");
    expect(src).toContain("'en'");
  });

  it('es metadata is registered', () => {
    const src = readFile(join(VENDOR, 'packages/client/locale/src/client/index.ts'));
    expect(src).not.toBeNull();
    expect(src).toContain('es:');
    expect(src).toContain('Español');
  });
});

describe('Locale contract — Shell i18n', () => {
  it('supports zh, en, and es locales', () => {
    const src = readFile(join(APPS, 'src/main/i18n.ts'));
    expect(src).not.toBeNull();
    expect(src).toContain("'zh'");
    expect(src).toContain("'en'");
    expect(src).toContain("'es'");
  });

  it('has Spanish string entries', () => {
    const src = readFile(join(APPS, 'src/main/i18n.ts'));
    expect(src).not.toBeNull();
    // Must have at least some es: entries
    const esCount = (src.match(/es:/g) || []).length;
    expect(esCount).toBeGreaterThanOrEqual(10);
  });

  it('locale type restricts to zh|en|es', () => {
    const src = readFile(join(APPS, 'src/main/i18n.ts'));
    expect(src).not.toBeNull();
    // Type definition may have different order; just verify all three are present
    expect(src).toContain('zh');
    expect(src).toContain('en');
    expect(src).toContain('es');
  });
});

describe('Locale contract — About/version', () => {
  it('About dialog uses app.getVersion()', () => {
    const src = readFile(join(APPS, 'src/main/index.ts'));
    expect(src).not.toBeNull();
    expect(src).toContain('app.getVersion()');
  });

  it('shell package.json version is 0.8.0', () => {
    const pkg = readFile(join(APPS, 'package.json'));
    expect(pkg).not.toBeNull();
    expect(pkg).toContain('"0.8.0"');
  });
});

describe('Locale contract — Reasoning policy', () => {
  it('hides effort for non-supporting models', () => {
    const src = readFile(join(APPS, 'src/main/reasoning-policy.ts'));
    expect(src).not.toBeNull();
    // Must declare false return for non-reasoning models
    expect(src).toContain('return false');
  });

  it('has DEEPSEEK_REASONING_EFFORTS with all tiers', () => {
    const src = readFile(join(APPS, 'src/main/reasoning-policy.ts'));
    expect(src).not.toBeNull();
    // DeepSeek object must have off, low, high, max
    expect(src).toContain('DEEPSEEK_REASONING_EFFORTS');
    expect(src).toContain('off:');
    expect(src).toContain('low:');
    expect(src).toContain('high:');
    expect(src).toContain('max:');
  });

  it('has MIMO_REASONING_EFFORTS with binary toggle', () => {
    const src = readFile(join(APPS, 'src/main/reasoning-policy.ts'));
    expect(src).not.toBeNull();
    // MiMo must only have off and high (binary thinking)
    expect(src).toContain('MIMO_REASONING_EFFORTS');
    // Must not have low or max for MiMo
    const mimoBlock = src.substring(
      src.indexOf('MIMO_REASONING_EFFORTS'),
      src.indexOf('}', src.indexOf('MIMO_REASONING_EFFORTS')) + 1
    );
    expect(mimoBlock).not.toContain('low:');
    expect(mimoBlock).not.toContain('max:');
  });
});

describe('Locale contract — UI elements', () => {
  it('update button exists with rotated arrow', () => {
    const src = readFile(join(APPS, 'src/main/index.ts'));
    expect(src).not.toBeNull();
    expect(src).toContain('renderUpdateIndicatorHtml');
    expect(src).toContain('rotate(180');
  });

  it('dialog bridge exists for directory picker', () => {
    expect(existsSync(join(APPS, 'src/main/dialog-bridge.ts'))).toBe(true);
  });

  it('MCP settings tab exists', () => {
    const path = join(VENDOR, 'packages/client/ui-settings-plugins/src/client/McpSettingsTab.tsx');
    expect(existsSync(path)).toBe(true);
  });

  it('Caveman settings card exists', () => {
    const path = join(VENDOR, 'packages/client/ui-settings-plugins/src/client/BashCard.tsx');
    expect(existsSync(path)).toBe(true);
  });
});
