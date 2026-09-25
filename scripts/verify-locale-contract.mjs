#!/usr/bin/env node
/**
 * verify-locale-contract.mjs — Phase 8: Verify Spanish locale and desktop capability contracts.
 *
 * Checks that:
 *   1. Spanish locale exists in upstream client (es.ts, LOCALE_IDS includes 'es')
 *   2. Shell-side i18n covers all three locales (zh, en, es)
 *   3. Patch 140 is registered and has contract tests
 *   4. About reads app.getVersion()
 *   5. Reasoning effort is hidden for non-supporting models
 *   6. Update button exists and matches Send visual
 *   7. Directory picker bridge exists
 *   8. MCP/Caveman settings UI exists
 *
 * Usage:
 *   node scripts/verify-locale-contract.mjs
 *
 * Exit code 0 = all checks pass. Non-zero = failure.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const VENDOR = join(REPO_ROOT, 'vendor/deepseek-harness');
const APPS = join(REPO_ROOT, 'apps/shell');

const checks = [];
function logCheck(name, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  const detailStr = detail ? ` (${detail})` : '';
  console.log(`  [${status}] ${name}${detailStr}`);
  checks.push({ name, pass });
}

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

// ── CHECK 1: Spanish locale file exists in vendor ───────────────────

const esPath = join(VENDOR, 'packages/client/locale/src/locales/es.ts');
const esSrc = readFileSafe(esPath);

logCheck(
  'spanish-locale-file-exists',
  esSrc !== null && esSrc.includes('CommonKey'),
  'vendor/es.ts must exist and export a Spanish dictionary',
);

// ── CHECK 2: LOCALE_IDS includes 'es' ──────────────────────────────

const localeSettingsPath = join(VENDOR, 'packages/client/locale/src/locale-settings.ts');
const localeSettingsSrc = readFileSafe(localeSettingsPath);

logCheck(
  'locale-ids-includes-es',
  localeSettingsSrc !== null && localeSettingsSrc.includes("'es'"),
  'LOCALE_IDS must include es',
);

// ── CHECK 3: Spanish metadata registered ────────────────────────────

const clientIndexPath = join(VENDOR, 'packages/client/locale/src/client/index.ts');
const clientIndexSrc = readFileSafe(clientIndexPath);

logCheck(
  'spanish-metadata-registered',
  clientIndexSrc !== null
    && clientIndexSrc.includes("es:")
    && clientIndexSrc.includes("label"),
  'Spanish metadata must be registered in BUILT_IN_LOCALE_METADATA',
);

// ── CHECK 4: Shell i18n covers all three locales ───────────────────

const i18nPath = join(APPS, 'src/main/i18n.ts');
const i18nSrc = readFileSafe(i18nPath);

logCheck(
  'shell-i18n-three-locales',
  i18nSrc !== null
    && i18nSrc.includes("'zh'")
    && i18nSrc.includes("'en'")
    && i18nSrc.includes("'es'"),
  'Shell i18n must support zh, en, and es',
);

logCheck(
  'shell-i18n-es-strings',
  i18nSrc !== null && i18nSrc.includes('es:') && i18nSrc.length > 3000,
  'Shell i18n must have Spanish string dictionary',
);

// ── CHECK 5: Patch 140 registered in manifest ──────────────────────

const manifestPath = join(REPO_ROOT, 'patches/upstream/upstream-patches.json');
const manifestSrc = readFileSafe(manifestPath);

logCheck(
  'patch-140-registered',
  manifestSrc !== null && manifestSrc.includes('140-freecode-spanish-locale.patch'),
  'Patch 140 must be registered in upstream-patches.json',
);

// ── CHECK 6: About reads app.getVersion() ──────────────────────────

const indexTsPath = join(APPS, 'src/main/index.ts');
const indexTsSrc = readFileSafe(indexTsPath);

logCheck(
  'about-uses-get-version',
  indexTsSrc !== null && indexTsSrc.includes('app.getVersion()'),
  'About dialog must use app.getVersion()',
);

// ── CHECK 7: Version is 0.8.0 ──────────────────────────────────────

const shellPkgPath = join(APPS, 'package.json');
const shellPkgSrc = readFileSafe(shellPkgPath);

logCheck(
  'version-is-080',
  shellPkgSrc !== null && shellPkgSrc.includes('"0.8.0"'),
  'Shell package.json version must be 0.8.0',
);

// ── CHECK 8: Reasoning policy hides for non-supporting models ───────

const reasoningPath = join(APPS, 'src/main/reasoning-policy.ts');
const reasoningSrc = readFileSafe(reasoningPath);

logCheck(
  'reasoning-hides-non-supporting',
  reasoningSrc !== null
    && reasoningSrc.includes('supportsReasoningEffort: false')
    && reasoningSrc.includes('reasoningEfforts'),
  'Reasoning policy must return false for non-supporting models',
);

// ── CHECK 9: Update button exists ───────────────────────────────────

logCheck(
  'update-button-exists',
  indexTsSrc !== null
    && indexTsSrc.includes('renderUpdateIndicatorHtml')
    && indexTsSrc.includes('rotate(180'),
  'Update button must exist with rotated arrow',
);

// ── CHECK 10: Directory picker bridge exists ────────────────────────

const dialogBridgePath = join(APPS, 'src/main/dialog-bridge.ts');
const dialogBridgeExists = existsSync(dialogBridgePath);

logCheck(
  'dialog-bridge-exists',
  dialogBridgeExists,
  'dialog-bridge.ts must exist for directory picker',
);

// ── CHECK 11: MCP settings tab exists ───────────────────────────────

const mcpTabPath = join(VENDOR, 'packages/client/ui-settings-plugins/src/client/McpSettingsTab.tsx');
const mcpTabExists = existsSync(mcpTabPath);

logCheck(
  'mcp-settings-tab-exists',
  mcpTabExists,
  'McpSettingsTab.tsx must exist for MCP status UI',
);

// ── CHECK 12: Caveman settings card exists ──────────────────────────

const bashCardPath = join(VENDOR, 'packages/client/ui-settings-plugins/src/client/BashCard.tsx');
const bashCardExists = existsSync(bashCardPath);

logCheck(
  'caveman-settings-card-exists',
  bashCardExists,
  'BashCard.tsx must exist for Caveman toggle',
);

// ── CHECK 13: Preload exposes locale.set ────────────────────────────

const preloadPath = join(APPS, 'src/preload/index.ts');
const preloadSrc = readFileSafe(preloadPath);

logCheck(
  'preload-exposes-locale-set',
  preloadSrc !== null && preloadSrc.includes('localeSet') && preloadSrc.includes('locale'),
  'Preload must expose localeSet channel',
);

// ── CHECK 14: IPC validates locale ──────────────────────────────────

const ipcPath = join(APPS, 'src/main/ipc.ts');
const ipcSrc = readFileSafe(ipcPath);

logCheck(
  'ipc-validates-locale',
  ipcSrc !== null
    && ipcSrc.includes('LocaleSetPayload')
    && ipcSrc.includes("'zh'") && ipcSrc.includes("'en'") && ipcSrc.includes("'es'"),
  'IPC must validate locale with zh, en, and es',
);

// ── CHECK 15: Locale contract tests exist ───────────────────────────

const localeTestPath = join(REPO_ROOT, 'packages/contract-tests/tests/locale.contract.test.ts');
const localeTestExists = existsSync(localeTestPath);

logCheck(
  'locale-contract-tests-exist',
  localeTestExists,
  'packages/contract-tests/tests/locale.contract.test.ts must exist',
);

// ── Summary ─────────────────────────────────────────────────────────

console.log();
const allPass = checks.every(c => c.pass);
const total = checks.length;
const passed = checks.filter(c => c.pass).length;
console.log(`verify-locale-contract: ${passed}/${total} checks passed`);
console.log(`\n  "result": "${allPass ? 'PASS' : 'FAIL'}"`);
process.exit(allPass ? 0 : 1);
