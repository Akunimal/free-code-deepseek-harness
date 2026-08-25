/**
 * electron-builder beforePack hook — patches NSIS templates:
 *
 * 1. multiUser.nsh — removes SHGetKnownFolderPath crash on Win11 24H2/25H2
 *    See: https://github.com/electron-userland/electron-builder/issues/8536
 *
 * 2. allowOnlyOneInstallerInstance.nsh — replaces false-positive process check
 *    with silent taskkill (Win11 25H2 FIND_PROCESS gives false positives)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findNsisTemplate(filename) {
  const root = path.resolve(__dirname, '../../..');

  // electron-builder has its own nested app-builder-lib under pnpm. That is
  // the copy whose templates are actually compiled; a separately installed
  // app-builder-lib must not win resolution here.
  const packageJsonPaths = [];
  try {
    const electronBuilderPackage = require.resolve('electron-builder/package.json');
    packageJsonPaths.push(require.resolve('app-builder-lib/package.json', {
      paths: [path.dirname(electronBuilderPackage)],
    }));
  } catch { /* */ }
  try {
    packageJsonPaths.push(require.resolve('app-builder-lib/package.json'));
  } catch { /* */ }

  for (const packageJsonPath of packageJsonPaths) {
    const appBuilderLib = path.dirname(packageJsonPath);
    const p = path.join(appBuilderLib, 'templates', 'nsis', filename);
    if (fs.existsSync(p)) return p;
    const p2 = path.join(appBuilderLib, 'templates', 'nsis', 'include', filename);
    if (fs.existsSync(p2)) return p2;
  }

  // Fallback: scan .pnpm
  const candidates = fs.readdirSync(path.join(root, 'node_modules', '.pnpm')).filter(d => d.startsWith('app-builder-lib@'));
  for (const dir of candidates) {
    const base = path.join(root, 'node_modules', '.pnpm', dir, 'node_modules', 'app-builder-lib', 'templates', 'nsis');
    const p = path.join(base, filename);
    if (fs.existsSync(p)) return p;
    const p2 = path.join(base, 'include', filename);
    if (fs.existsSync(p2)) return p2;
  }
  return null;
}

function patchMultiUser() {
  const multiUserPath = findNsisTemplate('multiUser.nsh');
  if (!multiUserPath) {
    console.warn('[patch-nsis] multiUser.nsh not found');
    return;
  }

  let content = fs.readFileSync(multiUserPath, 'utf8');

  if (content.includes('PATCHED: skip SHGetKnownFolderPath')) {
    console.log('[patch-nsis] multiUser.nsh already patched');
    return;
  }

  if (!content.includes('System::Store S')) {
    console.warn('[patch-nsis] System::Store S not found — template may have changed');
    return;
  }

  const regex = /(\s*StrCpy \$0 "\$LocalAppData\\Programs")\s*\n\s*System::Store S\s*\n\s*#[^\n]*\n\s*System::Call 'SHELL32::SHGetKnownFolderPath[^']*'\s*\n\s*\$\{If\} \$1 == 0\s*\n\s*System::Call '\*\$2[^']*'\s*\n\s*StrCpy \$0 \$1\s*\n\s*System::Call 'OLE32::CoTaskMemFree[^']*'\s*\n\s*\$\{endif\}\s*\n\s*System::Store L/;

  if (regex.test(content)) {
    content = content.replace(regex, '$1  ; PATCHED: skip SHGetKnownFolderPath (crash on Win11 24H2/25H2)');
    fs.writeFileSync(multiUserPath, content, 'utf8');
    console.log('[patch-nsis] multiUser.nsh patched — removed SHGetKnownFolderPath crash path');
  } else {
    console.warn('[patch-nsis] regex did not match — check multiUser.nsh manually');
  }
}

function patchAppRunningCheck() {
  const nshPath = findNsisTemplate('allowOnlyOneInstallerInstance.nsh');
  if (!nshPath) {
    console.warn('[patch-nsis] allowOnlyOneInstallerInstance.nsh not found');
    return;
  }

  let content = fs.readFileSync(nshPath, 'utf8');

  if (content.includes('PATCHED: taskkill instead of process check')) {
    console.log('[patch-nsis] allowOnlyOneInstallerInstance.nsh already patched');
    return;
  }

  if (!content.includes('!macro _CHECK_APP_RUNNING')) {
    console.warn('[patch-nsis] _CHECK_APP_RUNNING macro not found — template may have changed');
    return;
  }

  // Replace _CHECK_APP_RUNNING macro with simple taskkill
  const macroRegex = /!macro _CHECK_APP_RUNNING[\s\S]*?!macroend/;
  if (macroRegex.test(content)) {
    content = content.replace(macroRegex,
`!macro _CHECK_APP_RUNNING
  ; PATCHED: taskkill instead of process check (Win11 25H2 false positives)
  nsExec::ExecToLog 'taskkill /F /IM "\${APP_EXECUTABLE_FILENAME}"'
  Sleep 1000
!macroend`);
    fs.writeFileSync(nshPath, content, 'utf8');
    console.log('[patch-nsis] allowOnlyOneInstallerInstance.nsh patched — taskkill replaces process check');
  } else {
    console.warn('[patch-nsis] _CHECK_APP_RUNNING regex did not match');
  }
}

function removeUnusedUninstallResultHelper() {
  const nshPath = findNsisTemplate('installUtil.nsh');
  if (!nshPath) {
    throw new Error('[patch-nsis] installUtil.nsh not found — refusing to build an unsafe installer');
  }

  let content = fs.readFileSync(nshPath, 'utf8');

  const resultHelperPatched = content.includes('PATCHED: FreeCode skips stale uninstall result helper');
  const oldFunctionPatched = content.includes('PATCHED: FreeCode skips stale uninstall function');
  const deadHelpersPatched = content.includes('PATCHED: FreeCode skips dead uninstall helpers');
  if (resultHelperPatched && oldFunctionPatched && deadHelpersPatched) {
    console.log('[patch-nsis] installUtil.nsh already removes unused stale uninstall helpers');
    return;
  }

  // installSection.nsh no longer invokes uninstallOldVersion, so its result
  // helper becomes an unreferenced NSIS function. NSIS treats warning 6010 as
  // fatal in electron-builder; remove only this dead helper, never the actual
  // installer payload or user-data paths.
  if (!resultHelperPatched) {
    const helper = /Function handleUninstallResult\r?\n[\s\S]*?FunctionEnd\r?\n\r?\n!macro handleUninstallResult ROOT_KEY\r?\n[\s\S]*?!macroend\r?\n/;
    if (!helper.test(content)) {
      throw new Error('[patch-nsis] installUtil.nsh changed; unused uninstall result helper was not found');
    }
    content = content.replace(helper, '; PATCHED: FreeCode skips stale uninstall result helper\n');
  }

  if (!oldFunctionPatched) {
    const oldFunction = /# http:\/\/stackoverflow\.com\/questions\/24595887\/[\s\S]*?Function uninstallOldVersion[\s\S]*?!macro uninstallOldVersion ROOT_KEY\r?\n[\s\S]*?!macroend\r?\n/;
    if (!oldFunction.test(content)) {
      throw new Error('[patch-nsis] installUtil.nsh changed; stale uninstall function was not found');
    }
    content = content.replace(oldFunction, '; PATCHED: FreeCode skips stale uninstall function\n');
  }

  if (!deadHelpersPatched) {
    // GetInQuotes and GetFileParent are only used by uninstallOldVersion.
    // Leaving them behind makes makensis fail on warning 6010 after the
    // upgrade path is intentionally removed.
    const deadHelpers = /Function GetInQuotes\r?\n[\s\S]*?!macroend\r?\n\r?\nFunction GetFileParent\r?\n[\s\S]*?FunctionEnd\r?\n/;
    if (!deadHelpers.test(content)) {
      throw new Error('[patch-nsis] installUtil.nsh changed; dead uninstall helpers were not found');
    }
    content = content.replace(deadHelpers, '; PATCHED: FreeCode skips dead uninstall helpers\n\n');
  }

  fs.writeFileSync(nshPath, content, 'utf8');
  console.log('[patch-nsis] installUtil.nsh patched — removed unused stale uninstall helpers');
}

function patchInstallSection() {
  const installSectionPath = findNsisTemplate('installSection.nsh');
  if (!installSectionPath) {
    throw new Error('[patch-nsis] installSection.nsh not found — refusing to build an unsafe installer');
  }

  let content = fs.readFileSync(installSectionPath, 'utf8');
  if (content.includes('!insertmacro freecodePrepareInstall')) {
    console.log('[patch-nsis] installSection.nsh already uses deterministic FreeCode upgrade cleanup');
    return;
  }

  // electron-builder calls the previous uninstaller before extracting the new
  // payload. That path can hang or continue deleting the shared install dir
  // on Win11, leaving empty dsh/packages and dsh/node_modules directories.
  // The app has no user data under $INSTDIR, so remove only the shipped
  // resources/freecode tree and let the current installer extract it fresh.
  const oldCalls = /!insertmacro uninstallOldVersion SHELL_CONTEXT\r?\n!insertmacro handleUninstallResult SHELL_CONTEXT\r?\n\r?\n\$\{if\} \$installMode == "all"\r?\n  !insertmacro uninstallOldVersion HKEY_CURRENT_USER\r?\n  !insertmacro handleUninstallResult HKEY_CURRENT_USER\r?\n\$\{endIf\}/;
  if (!oldCalls.test(content)) {
    throw new Error('[patch-nsis] installSection.nsh changed; old-version uninstall calls were not found');
  }

  content = content.replace(oldCalls, '!insertmacro freecodePrepareInstall');
  fs.writeFileSync(installSectionPath, content, 'utf8');
  console.log('[patch-nsis] installSection.nsh patched — skip stale old uninstaller and clean payload before extraction');
}

function patchExtractAppPackage() {
  // Keep electron-builder's native extraction fallback. Its LogicLib block
  // changed between builder releases; replacing it here can remove an
  // ${endIf} and make makensis reject the complete installer script.
  console.log('[patch-nsis] extractAppPackage.nsh left unchanged — use native fallback');
}

module.exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;

  patchMultiUser();
  patchAppRunningCheck();
  patchInstallSection();
  removeUnusedUninstallResultHelper();
  patchExtractAppPackage();
};
