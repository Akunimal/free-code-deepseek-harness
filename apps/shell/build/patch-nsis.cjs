/**
 * electron-builder beforePack hook — patches NSIS templates:
 *
 * 1. multiUser.nsh — removes SHGetKnownFolderPath crash on Win11 24H2/25H2
 *    See: https://github.com/electron-userland/electron-builder/issues/8536
 *
 * 2. allowOnlyOneInstallerInstance.nsh — routes fallback process cleanup to
 *    FreeCode's path-scoped hook (Win11 25H2 FIND_PROCESS false positives)
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

  if (content.includes('PATCHED: FreeCode path-scoped process cleanup')) {
    console.log('[patch-nsis] allowOnlyOneInstallerInstance.nsh already uses path-scoped cleanup');
    return;
  }

  if (!content.includes('!macro _CHECK_APP_RUNNING')) {
    throw new Error('[patch-nsis] _CHECK_APP_RUNNING macro not found — refusing an installer with unknown process cleanup');
  }

  // Keep the fallback on the same path-scoped FreeCode hook. Never kill by
  // image name: a side-by-side copy must not stop the user's other install.
  const macroRegex = /!macro _CHECK_APP_RUNNING[\s\S]*?!macroend/;
  if (macroRegex.test(content)) {
    content = content.replace(macroRegex,
`!macro _CHECK_APP_RUNNING
  ; PATCHED: FreeCode path-scoped process cleanup under $INSTDIR only.
  !insertmacro customCheckAppRunning
!macroend`);
    fs.writeFileSync(nshPath, content, 'utf8');
    console.log('[patch-nsis] allowOnlyOneInstallerInstance.nsh patched — process cleanup is scoped to $INSTDIR');
  } else {
    throw new Error('[patch-nsis] _CHECK_APP_RUNNING regex did not match — refusing an installer with unknown process cleanup');
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

function guardStrContainsInclude(content) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const guardedInclude = [
    '!ifndef BUILD_UNINSTALLER',
    '!include "StrContains.nsh"',
    '!endif',
  ].join(newline);
  const guardedPattern = /^[ \t]*!ifndef BUILD_UNINSTALLER[ \t]*\r?\n[ \t]*!include "StrContains\.nsh"[ \t]*\r?\n[ \t]*!endif[ \t]*$/m;
  if (guardedPattern.test(content)) return content;

  const includePattern = /^([ \t]*)!include "StrContains\.nsh"[ \t]*$/m;
  if (includePattern.test(content)) {
    return content.replace(includePattern, (_line, indent) => [
      `${indent}!ifndef BUILD_UNINSTALLER`,
      `${indent}!include "StrContains.nsh"`,
      `${indent}!endif`,
    ].join(newline));
  }

  const anchor = '!include "common.nsh"';
  if (!content.includes(anchor)) {
    throw new Error('[patch-nsis] installer.nsi changed; common.nsh include was not found');
  }
  return content.replace(anchor, `${anchor}${newline}${guardedInclude}`);
}

function patchStrContainsInclude() {
  const installerPath = findNsisTemplate('installer.nsi');
  if (!installerPath) {
    throw new Error('[patch-nsis] installer.nsi not found — refusing an installer without smoke-path protection');
  }

  const current = fs.readFileSync(installerPath, 'utf8');
  const guarded = guardStrContainsInclude(current);
  if (guarded === current) return;

  fs.writeFileSync(installerPath, guarded, 'utf8');
  console.log('[patch-nsis] installer.nsi gates StrContains to normal installer builds');
}

module.exports.guardStrContainsInclude = guardStrContainsInclude;

function patchInstDirSanitize() {
  const installSectionPath = findNsisTemplate('installSection.nsh');
  if (!installSectionPath) {
    throw new Error('[patch-nsis] installSection.nsh not found — refusing to build an unsafe installer');
  }

  let content = fs.readFileSync(installSectionPath, 'utf8');
  const patchMarker = '; PATCHED (FreeCode): reject stale smoke install paths before accepting an absolute $INSTDIR.';
  const runtimeSmokeTargetRead = 'ReadEnvStr $R4 "FREECODE_NSIS_SMOKE_INSTALL_DIR"';
  if (content.includes(patchMarker) && content.includes(runtimeSmokeTargetRead) &&
      !content.includes('$%FREECODE_NSIS_SMOKE_INSTALL_DIR%')) {
    console.log('[patch-nsis] installSection.nsh already rejects stale NSIS smoke targets');
    return;
  }
  if (content.includes(patchMarker) &&
      (!content.includes('StrContains') || !content.includes('FREECODE_NSIS_SMOKE_INSTALL_DIR'))) {
    throw new Error('[patch-nsis] installSection.nsh has an incomplete smoke-target guard');
  }

  // $INSTDIR arrives from /D or from the InstallLocation registry value.
  // A stale drive-relative value (e.g. `D:dir` from an interrupted run)
  // makes the whole install silently land nowhere with exit code 0.
  // Reset persisted smoke-test targets unless this exact path is being used
  // by the isolated smoke runner. Reset non-absolute paths to the default
  // BEFORE $appExe is derived and the payload is extracted. Other absolute
  // /D paths remain valid.
  // (A customInit macro cannot do this: installer.nsi evaluates
  // `!ifmacrodef customInit` before this file is ever parsed.)
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    .split('')
    .map((ch) => `  StrCmp $R9 "${ch}" _freecodeInstDirOk`)
    .join('\n');
  const block = [
    `  ${patchMarker}`,
    '  Push $R9',
    '  Push $R8',
    '  Push $R7',
    '  Push $R6',
    '  Push $R5',
    '  Push $R4',
    '  ${StrContains} $R5 "freecode-nsis-smoke-" "$INSTDIR"',
    '  StrCmp $R5 "" _freecodeInstDirCheckAbsolute',
    `  ${runtimeSmokeTargetRead}`,
    '  StrCmp $R4 "$INSTDIR" _freecodeInstDirCheckAbsolute',
    '  Goto _freecodeInstDirBad',
    '  _freecodeInstDirCheckAbsolute:',
    '  StrCpy $R9 $INSTDIR 1',
    '  StrCpy $R8 $INSTDIR 1 1',
    '  StrCpy $R7 $INSTDIR 1 2',
    '  StrCpy $R6 $INSTDIR 2',
    '  StrCmp $R6 "\\\\" _freecodeInstDirOk _freecodeNotUnc',
    '  _freecodeNotUnc:',
    '  StrCmp $R8 ":" _freecodeHasColon _freecodeInstDirBad',
    '  _freecodeHasColon:',
    '  StrCmp $R7 "\\" _freecodeCheckLetter _freecodeCheckSlash2',
    '  _freecodeCheckSlash2:',
    '  StrCmp $R7 "/" _freecodeCheckLetter _freecodeInstDirBad',
    '  _freecodeCheckLetter:',
    letters,
    '  Goto _freecodeInstDirBad',
    '  _freecodeInstDirBad:',
    '  StrCpy $INSTDIR "$LocalAppData\\Programs\\${APP_FILENAME}"',
    '  _freecodeInstDirOk:',
    '  Pop $R4',
    '  Pop $R5',
    '  Pop $R6',
    '  Pop $R7',
    '  Pop $R8',
    '  Pop $R9',
  ].join('\n');

  const anchor = 'StrCpy $appExe "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"';
  if (!content.includes(anchor)) {
    throw new Error('[patch-nsis] installSection.nsh changed; $appExe anchor was not found');
  }
  const oldPatchMarker = '  ; PATCHED (FreeCode): reset non-absolute $INSTDIR to the default.';
  const oldPatchStart = content.indexOf(oldPatchMarker);
  const smokePatchStart = content.indexOf(patchMarker);
  if (smokePatchStart >= 0) {
    const lineStart = content.lastIndexOf('\n', smokePatchStart) + 1;
    const registerRestore = content.indexOf('  Pop $R9', smokePatchStart);
    if (registerRestore < 0) throw new Error('[patch-nsis] existing smoke-target guard is incomplete; refusing to guess replacement range');
    const lineEnd = content.indexOf('\n', registerRestore);
    const end = lineEnd < 0 ? content.length : lineEnd + 1;
    content = content.slice(0, lineStart) + block + '\n' + content.slice(end);
  } else if (oldPatchStart >= 0) {
    const anchorIndex = content.indexOf(anchor, oldPatchStart);
    if (anchorIndex < 0) throw new Error('[patch-nsis] old $INSTDIR guard is incomplete; refusing to guess replacement range');
    content = content.slice(0, oldPatchStart) + block + '\n' + content.slice(anchorIndex);
  } else if (content.includes('_freecodeInstDirBad')) {
    throw new Error('[patch-nsis] unrecognized existing $INSTDIR guard; refusing a partial sanitizer');
  } else {
    content = content.replace(anchor, block + '\n' + anchor);
  }
  fs.writeFileSync(installSectionPath, content, 'utf8');
  console.log('[patch-nsis] installSection.nsh patched — stale smoke and non-absolute targets reset to default');
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
  patchStrContainsInclude();
  patchInstallSection();
  patchInstDirSanitize();
  removeUnusedUninstallResultHelper();
  patchExtractAppPackage();
};
