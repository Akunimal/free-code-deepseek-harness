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

  // Try require.resolve first
  try {
    const appBuilderLib = path.dirname(require.resolve('app-builder-lib/package.json'));
    const p = path.join(appBuilderLib, 'templates', 'nsis',
      filename.includes('/') ? filename : filename);
    if (fs.existsSync(p)) return p;
    const p2 = path.join(appBuilderLib, 'templates', 'nsis', 'include', filename);
    if (fs.existsSync(p2)) return p2;
  } catch { /* */ }

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

  if (content.includes('PATCHED: skip uninstall retry loop')) {
    console.log('[patch-nsis] installUtil.nsh already patched');
    return;
  }

  // The old uninstaller (from a previous install) may have buggy process
  // detection that false-positives on Win11 25H2, causing it to exit non-zero.
  // uninstallOldVersion retries 5 times then shows "appCannotBeClosed" dialog.
  // Fix: kill the app before running the old uninstaller, run it once,
  // and treat any exit code as success (files get overwritten anyway).
  // Match the section after copyFile that runs the old uninstaller
  // Template varies by version - match from ExecWait through DoesNotExist
  const oldLoop = /\\s*ExecWait '\\"\\$uninstallerFileNameTemp\\"\\/S \\/KEEP_APP_DATA \\$0 _\\?=\\$installationDir' \\$R0\\s*\\n\\s*ifErrors TryInPlace CheckResult[\\s\\S]*?DoesNotExist:\\s*\\n\\s*SetErrors\\s*\\n/;

  if (oldLoop.test(content)) {
    content = content.replace(oldLoop,
`# PATCHED: skip uninstall retry loop (old uninstaller false-positives on Win11 25H2)
    nsExec::ExecToLog 'taskkill /F /IM "\${APP_EXECUTABLE_FILENAME}"'
    Sleep 500

    ExecWait '"$uninstallerFileNameTemp" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
    ifErrors TryInPlace CheckResult

    TryInPlace:
      ExecWait '"$uninstallerFileName" /S /KEEP_APP_DATA $0 _?=$installationDir' $R0
      ifErrors DoesNotExist

    CheckResult:
      StrCpy $R0 0    ; PATCHED: ignore exit code from old uninstaller (false-positives on Win11 25H2)
      Return

  DoesNotExist:
    SetErrors
`);
    fs.writeFileSync(nshPath, content, 'utf8');
    console.log('[patch-nsis] installUtil.nsh patched — skip uninstall retry loop');
  } else {
    console.warn('[patch-nsis] uninstallOldVersion regex did not match — check installUtil.nsh');
  }
}

function patchExtractAppPackage() {
  const nshPath = findNsisTemplate('extractAppPackage.nsh');
  if (!nshPath) {
    console.warn('[patch-nsis] extractAppPackage.nsh not found');
    return;
  }

  let content = fs.readFileSync(nshPath, 'utf8');

  if (content.includes('PATCHED: skip copy-fail dialog')) {
    console.log('[patch-nsis] extractAppPackage.nsh already patched');
    return;
  }

  // When CopyFiles fails after 5 retries, the template shows appCannotBeClosed
  // dialog and has an AbortExtract7za label. On Win11 25H2 the old uninstaller
  // may not clean up properly. Patch: remove dialog + dead abort label,
  // let the else branch fall through to the non-atomic extract.
  const dialogBlock = /MessageBox MB_RETRYCANCEL\|MB_ICONEXCLAMATION "\$\(appCannotBeClosed\)" \/SD IDRETRY IDCANCEL AbortExtract7za[\s\S]*?AbortExtract7za:\s*\n\s*Quit\s*\n/;

  if (dialogBlock.test(content)) {
    content = content.replace(dialogBlock,
      `# PATCHED: skip copy-fail dialog — fall through to non-atomic extract\n`);
    fs.writeFileSync(nshPath, content, 'utf8');
    console.log('[patch-nsis] extractAppPackage.nsh patched — skip copy-fail dialog');
  } else {
    console.warn('[patch-nsis] extractAppPackage.nsh regex did not match');
  }
}

module.exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;

  patchMultiUser();
  patchAppRunningCheck();
  patchUninstallOldVersion();
  patchExtractAppPackage();
};
