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

function patchUninstallOldVersion() {
  const nshPath = findNsisTemplate('installUtil.nsh');
  if (!nshPath) {
    console.warn('[patch-nsis] installUtil.nsh not found');
    return;
  }

  let content = fs.readFileSync(nshPath, 'utf8');

  if (content.includes('PATCHED: guard missing old uninstaller')) {
    console.log('[patch-nsis] installUtil.nsh already patched');
    return;
  }

  // The old uninstaller (from a previous install) may have buggy process
  // detection that false-positives on Win11 25H2, causing it to exit non-zero.
  // uninstallOldVersion retries 5 times then shows "appCannotBeClosed" dialog.
  // Fix: kill the app before running the old uninstaller, run it once,
  // and treat any exit code as success (files get overwritten anyway).
  // Replace the retry loop while preserving the two execution fallbacks and
  // the DoesNotExist error path. Removing only the loop body leaves the
  // template's LogicLib labels balanced and avoids the prior broken NSIS build.
  const oldLoop = /  StrCpy \$uninstallerFileNameTemp "\$PLUGINSDIR\\old-uninstaller\.exe"\r?\n  !insertmacro copyFile "\$uninstallerFileName" "\$uninstallerFileNameTemp"\r?\n\r?\n  # Retry counter\r?\n[\s\S]*?  DoesNotExist:\r?\n    SetErrors\r?\n/;

  if (oldLoop.test(content)) {
    content = content.replace(oldLoop,
`  # PATCHED: guard missing old uninstaller and skip retry loop (old uninstaller false-positives on Win11 25H2)
    IfFileExists "$uninstallerFileName" 0 OldUninstallerMissing
    StrCpy $uninstallerFileNameTemp "$PLUGINSDIR\\old-uninstaller.exe"
    !insertmacro copyFile "$uninstallerFileName" "$uninstallerFileNameTemp"
    IfFileExists "$uninstallerFileNameTemp" 0 OldUninstallerMissing

    nsExec::ExecToLog 'taskkill /F /IM "\${APP_EXECUTABLE_FILENAME}"'
    Sleep 500

    ExecWait '"$uninstallerFileNameTemp" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
    ifErrors TryInPlace CheckResult

  TryInPlace:
      ExecWait '"$uninstallerFileName" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
      ifErrors DoesNotExist

  CheckResult:
    StrCpy $R0 0    ; PATCHED: ignore exit code from old uninstaller (false-positives on Win11 25H2)
    ClearErrors
    Return

  DoesNotExist:
    SetErrors
  OldUninstallerMissing:
    ; A stale registry entry can point at a removed installer directory.
    ClearErrors
    Return
`);
    fs.writeFileSync(nshPath, content, 'utf8');
    console.log('[patch-nsis] installUtil.nsh patched — skip uninstall retry loop');
  } else {
    console.warn('[patch-nsis] uninstallOldVersion regex did not match — check installUtil.nsh');
  }
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
  patchUninstallOldVersion();
  patchExtractAppPackage();
};
