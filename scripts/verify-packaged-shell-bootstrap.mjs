#!/usr/bin/env node
/**
 * Fail packaging when the actual app.asar still contains the pre-bootstrap
 * shell entry point. The DSH runtime payload is intentionally excluded from
 * setup, so the packaged app must read its compatibility manifest and
 * download/validate it before running DSH preflight.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const SHELL_MAIN_ENTRY = join('dist', 'src', 'main', 'index.js');
const UPDATE_INDICATOR_ENTRY = join('dist', 'src', 'main', 'update-indicator-html.js');
const BOOTSTRAP_DEFINITION = 'async function ensurePackagedHarnessRuntime(';
const BOOTSTRAP_GUARD = 'app.isPackaged && !(await ensurePackagedHarnessRuntime(harnessRuntimeDir, resources))';
const COMPATIBILITY_REQUIREMENTS_CALL = "readHarnessRuntimeRequirements(join(staticResourcesDir, 'runtime-manifest.json'))";
const RUNTIME_DOWNLOAD_CALL = 'ensureHarnessRuntime({';
const DSH_PREFLIGHT_CALL = 'awaitHarnessLayout({';
const TRANSPARENT_UPDATE_SURFACE_CALL = "updateIndicatorView.setBackgroundColor('#00000000')";

function extractPackagedFile(archivePath, filePath) {
  const shellRequire = createRequire(join(root, 'apps', 'shell', 'package.json'));
  const electronBuilderPackage = shellRequire.resolve('electron-builder/package.json');
  const builderRequire = createRequire(electronBuilderPackage);
  return builderRequire('@electron/asar').extractFile(archivePath, filePath);
}

function inspectPackagedMain(mainSource) {
  const definitionAt = mainSource.indexOf(BOOTSTRAP_DEFINITION);
  const bootstrapAt = mainSource.indexOf(BOOTSTRAP_GUARD);
  const requirementsAt = mainSource.indexOf(COMPATIBILITY_REQUIREMENTS_CALL, definitionAt);
  const downloadAt = mainSource.indexOf(RUNTIME_DOWNLOAD_CALL, definitionAt);
  const preflightAt = mainSource.indexOf(DSH_PREFLIGHT_CALL);

  if (definitionAt < 0 || bootstrapAt < definitionAt || requirementsAt < definitionAt ||
      downloadAt < definitionAt || requirementsAt > downloadAt ||
      downloadAt > bootstrapAt || preflightAt < 0) {
    return {
      ok: false,
      error: 'packaged main is missing the first-run DSH bootstrap or compatibility requirements check',
    };
  }
  if (bootstrapAt >= preflightAt) {
    return { ok: false, error: 'first-run DSH bootstrap must run before DSH preflight' };
  }
  if (!mainSource.includes(TRANSPARENT_UPDATE_SURFACE_CALL)) {
    return { ok: false, error: 'packaged main is missing the transparent native surface for the update indicator' };
  }
  return { ok: true };
}

function inspectPackagedUpdateIndicator(indicatorSource) {
  const requiredStyles = [
    'width:34px;height:34px',
    'padding:0',
    '-webkit-appearance:none',
    'appearance:none',
    'border-radius:50%',
  ];
  if (!requiredStyles.every(style => indicatorSource.includes(style)) ||
      indicatorSource.includes('transform:translateY(-2px)')) {
    return { ok: false, error: 'packaged shell is missing the circular update indicator button contract' };
  }
  return { ok: true };
}

/**
 * Inspect the actual archive in electron-builder's appOutDir, not only the
 * TypeScript source or the potentially stale `dist` tree.
 * `extractFile` is injectable for deterministic policy tests.
 */
export function verifyPackagedShellBootstrap(options) {
  const appOutDir = resolve(options.appOutDir);
  const archivePath = join(appOutDir, 'resources', 'app.asar');
  if (!existsSync(archivePath)) {
    return { ok: false, error: `packaged app.asar not found: ${archivePath}` };
  }

  let mainSource;
  try {
    const extracted = (options.extractFile ?? extractPackagedFile)(archivePath, SHELL_MAIN_ENTRY);
    mainSource = Buffer.isBuffer(extracted) ? extracted.toString('utf8') : extracted;
  } catch (error) {
    return {
      ok: false,
      error: `could not read ${SHELL_MAIN_ENTRY} from packaged app.asar: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (typeof mainSource !== 'string') {
    return { ok: false, error: `packaged ${SHELL_MAIN_ENTRY} did not extract as text` };
  }
  const result = inspectPackagedMain(mainSource);
  if (!result.ok) return { ...result, archivePath, entryPath: SHELL_MAIN_ENTRY };

  let indicatorSource;
  try {
    const extracted = (options.extractFile ?? extractPackagedFile)(archivePath, UPDATE_INDICATOR_ENTRY);
    indicatorSource = Buffer.isBuffer(extracted) ? extracted.toString('utf8') : extracted;
  } catch (error) {
    return {
      ok: false,
      error: `could not read ${UPDATE_INDICATOR_ENTRY} from packaged app.asar: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (typeof indicatorSource !== 'string') {
    return { ok: false, error: `packaged ${UPDATE_INDICATOR_ENTRY} did not extract as text` };
  }
  const indicatorResult = inspectPackagedUpdateIndicator(indicatorSource);
  if (!indicatorResult.ok) return { ...indicatorResult, archivePath, entryPath: UPDATE_INDICATOR_ENTRY };
  return { ok: true, archivePath, entryPath: SHELL_MAIN_ENTRY, updateIndicatorEntryPath: UPDATE_INDICATOR_ENTRY };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [appOutDir] = process.argv.slice(2);
  if (!appOutDir) {
    console.error('Usage: verify-packaged-shell-bootstrap.mjs <appOutDir>');
    process.exitCode = 2;
  } else {
    const result = verifyPackagedShellBootstrap({ appOutDir });
    if (!result.ok) {
      console.error(`verify-packaged-shell-bootstrap: FAIL — ${result.error}`);
      process.exitCode = 1;
    } else {
      console.log(`verify-packaged-shell-bootstrap: PASS — ${result.entryPath} in ${result.archivePath}`);
    }
  }
}
