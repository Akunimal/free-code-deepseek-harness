import { describe, expect, it } from 'vitest';
import { initLocale, locale, setLocale, t } from '../src/main/i18n.js';

describe('native shell locale', () => {
  it('supports the same three locales as the web selector', () => {
    setLocale('zh');
    expect(locale()).toBe('zh');
    expect(t('update.indicator')).toBe('发现更新');

    setLocale('en');
    expect(t('update.indicator')).toBe('Update available');

    setLocale('es');
    expect(t('update.indicator')).toBe('Actualización disponible');
  });

  it('maps regional system locales to the same native choices', () => {
    initLocale('zh-CN');
    expect(locale()).toBe('zh');
    initLocale('es-AR');
    expect(locale()).toBe('es');
    initLocale('en-US');
    expect(locale()).toBe('en');
  });

  it('covers the Tor overlay block in all three locales', () => {
    const keys = [
      'overlay.torTitle',
      'overlay.torRotate',
      'overlay.torRotating',
      'overlay.torLoading',
      'overlay.torRotated',
      'overlay.torRotateFailed',
      'overlay.directOnly',
      'tor.status.ready',
      'tor.status.failed',
      'stuck.timeout.message',
      'stuck.timeout.detail',
    ] as const;
    for (const locale of ['es', 'en', 'zh'] as const) {
      setLocale(locale);
      for (const key of keys) {
        const text = t(key);
        expect(text.length, `${locale}:${key}`).toBeGreaterThan(0);
        expect(text, `${locale}:${key}`).not.toBe(key);
      }
    }
  });

  it('points incomplete-install recovery at the official installer (no pinned old version)', () => {
    setLocale('es');
    const esHint = t('preflight.reinstallHint');
    expect(esHint).toContain('oficial');
    expect(esHint).not.toContain('v0.4.3');

    setLocale('en');
    const enHint = t('preflight.reinstallHint');
    expect(enHint).toContain('official');
    expect(enHint).not.toContain('v0.4.3');

    setLocale('zh');
    const zhHint = t('preflight.reinstallHint');
    expect(zhHint.length).toBeGreaterThan(10);
    expect(zhHint).not.toContain('v0.4.3');
  });
});
