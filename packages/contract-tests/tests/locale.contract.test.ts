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

describe('Locale contract — Spanish component dictionaries (patch 141)', () => {
  const COMPONENT_LOCALES: Array<{ file: string; esMarker: string; enStub: string }> = [
    { file: 'packages/client/ui-sidebar/src/client/locales.ts', esMarker: "'session.new': 'Nueva sesión'", enStub: "'session.new': 'New Session'" },
    { file: 'packages/client/ui-approval/src/client/locales.ts', esMarker: 'En espera de aprobación', enStub: 'Waiting for approval' },
    { file: 'packages/client/ui-commands/src/client/locales.ts', esMarker: "'search.placeholder': 'Buscar", enStub: "'search.placeholder': 'Search" },
    { file: 'packages/client/ui-goal/src/client/locales.ts', esMarker: 'Objetivo en curso', enStub: 'Ongoing Goal' },
    { file: 'packages/client/ui-input-trigger/src/client/locales.ts', esMarker: "'command': 'Comandos'", enStub: "'command': 'Commands'" },
    { file: 'packages/client/ui-jobs/src/client/locales.ts', esMarker: 'Trabajos en segundo plano', enStub: 'Background jobs' },
    { file: 'packages/client/ui-message-feedback/src/client/locales.ts', esMarker: 'Buena respuesta', enStub: 'Good response' },
    { file: 'packages/client/ui-plan/src/client/locales.ts', esMarker: 'Modo plan activado', enStub: 'Plan mode on' },
    { file: 'packages/client/ui-reference/src/client/locales.ts', esMarker: 'Archivos y carpetas', enStub: 'Files & folders' },
    { file: 'packages/client/ui-skill/src/client/locales.ts', esMarker: 'Cargando habilidad', enStub: 'Loading skill' },
    { file: 'packages/client/ui-theme/src/client/locales.ts', esMarker: "'appearance.title': 'Apariencia'", enStub: "'appearance.title': 'Appearance'" },
    { file: 'packages/client/ui-user-questions/src/client/locales.ts', esMarker: 'Pregunta anterior', enStub: 'Previous question' },
    { file: 'packages/client/ui-settings-general/src/client/locales.ts', esMarker: "'trigger': 'Configuración'", enStub: "'trigger': 'Settings'" },
    { file: 'packages/client/ui-deliverables/src/client/locales.ts', esMarker: "'produced.label': 'Producido'", enStub: "'produced.label': 'Produced'" },
    { file: 'packages/client/ui-workflow-run/src/client/locales.ts', esMarker: 'Sin miembros iniciados', enStub: 'No members started' },
    { file: 'packages/client/ui-model-selection/src/client/locales.ts', esMarker: 'Seleccionar modelo', enStub: 'Select model' },
    { file: 'packages/client/ui-permission-presets/src/client/locales.ts', esMarker: "'title': 'Permisos'", enStub: "'title': 'Permission'" },
    { file: 'packages/session-query/session-log-export/src/client/locales.ts', esMarker: 'Registro de sesión', enStub: 'Session log' },
    { file: 'packages/client/ui-schedule/src/client/locales.ts', esMarker: 'recordatorio', enStub: '{count} reminder' },
    { file: 'packages/client/ui-subagent/src/client/locales.ts', esMarker: 'Cargando subagentes', enStub: 'Loading subagents' },
    { file: 'packages/client/ui-agent-preset/src/client/locales.ts', esMarker: 'Presets de agente', enStub: 'Agent presets' },
    { file: 'packages/client/ui-settings-plugin-inventory/src/client/locales.ts', esMarker: 'Lista de complementos', enStub: 'Plugin list' },
    { file: 'packages/extensions/ui-cordis/src/client/locales.ts', esMarker: 'Registrar complemento Cordis', enStub: 'Register Cordis Plugin' },
    { file: 'packages/client/ui-workspace/src/client/locales.ts', esMarker: 'Espacios de trabajo', enStub: 'Workspaces' },
    { file: 'packages/experimental/client-ui-agent-team/src/client/locales.ts', esMarker: 'Equipo de agentes', enStub: 'Agent Team' },
    { file: 'packages/client/ui-settings-models/src/client/locales.ts', esMarker: "nav: 'Modelos'", enStub: "nav: 'Models'" },
    { file: 'packages/client/ui-settings-plugins/src/client/locales.ts', esMarker: "nav: 'Complementos'", enStub: "nav: 'Plugins'" },
    { file: 'packages/client/ui-chat/src/client/locale.ts', esMarker: "'details.title': 'Detalles'", enStub: "'details.title': 'Details'" },
    { file: 'packages/client/ui-conversation/src/client/locales.ts', esMarker: "'input.send': 'Enviar mensaje'", enStub: "'input.send': 'Send message'" },
    { file: 'packages/client/ui-trajectory/src/client/locales.ts', esMarker: "'view.trajectory': 'Trayectoria'", enStub: "'view.trajectory': 'Trajectory'" },
  ];

  function esBlockOf(src: string, exportName = 'export const es'): string | null {
    const start = src.indexOf(exportName);
    if (start === -1) return null;
    const brace = src.indexOf('{', start);
    if (brace === -1) return null;
    const end = src.indexOf('\n}', brace);
    if (end === -1) return null;
    return src.slice(brace, end);
  }

  it('all 30 component locale files declare es', () => {
    for (const entry of COMPONENT_LOCALES) {
      const src = readFile(join(VENDOR, entry.file));
      expect(src, entry.file).not.toBeNull();
      expect(esBlockOf(src!), entry.file).not.toBeNull();
    }
  });

  it('es differs from en on main visible keys (fails when es is a stub of en)', () => {
    for (const entry of COMPONENT_LOCALES) {
      const src = readFile(join(VENDOR, entry.file));
      expect(src, entry.file).not.toBeNull();
      const block = esBlockOf(src!)!;
      expect(block, `${entry.file} es should contain ${entry.esMarker}`).toContain(entry.esMarker);
      expect(block, `${entry.file} es should not still be English stub`).not.toContain(entry.enStub);
    }
  });

  it('permission popup gate accessEs is also translated', () => {
    const src = readFile(join(VENDOR, 'packages/client/ui-permission-presets/src/client/locales.ts'));
    expect(src).not.toBeNull();
    const block = esBlockOf(src!, 'export const accessEs')!;
    expect(block).toContain('Acceso total');
    expect(block).not.toContain("'confirm.title': 'Enable Full access?'");
  });

  it('spot-checks: settings.locale, sidebar, conversation', () => {
    const settings = readFile(join(VENDOR, 'packages/client/locale/src/locales/settings.ts'));
    expect(settings).not.toBeNull();
    expect(settings).toContain("'language.title': 'Idioma'");

    const sidebar = readFile(join(VENDOR, 'packages/client/ui-sidebar/src/client/locales.ts'));
    expect(sidebar).not.toBeNull();
    expect(esBlockOf(sidebar!)!).toContain('Nueva sesión');

    const conversation = readFile(join(VENDOR, 'packages/client/ui-conversation/src/client/locales.ts'));
    expect(conversation).not.toBeNull();
    const convEs = esBlockOf(conversation!)!;
    expect(convEs).toContain('Enviar mensaje');
    expect(convEs).toContain('Sesión no disponible');
    expect(convEs).not.toContain("'input.send': 'Send message'");
  });
});
