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
});
