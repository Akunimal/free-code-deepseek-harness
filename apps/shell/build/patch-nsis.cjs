/**
 * electron-builder beforePack hook — patches multiUser.nsh to remove the
 * System::Call to SHGetKnownFolderPath that crashes with 0xC0000005 on
 * Windows 11 24H2/25H2.
 *
 * See: https://github.com/electron-userland/electron-builder/issues/8536
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findMultiUserNsh() {
  // Try require.resolve first (works when electron-builder is the caller)
  try {
    const appBuilderLib = path.dirname(require.resolve('app-builder-lib/package.json'));
    const p = path.join(appBuilderLib, 'templates', 'nsis', 'multiUser.nsh');
    if (fs.existsSync(p)) return p;
  } catch { /* */ }

  // Fallback: glob from project root
  const root = path.resolve(__dirname, '../../..');
  const glob = path.join(root, 'node_modules', '.pnpm', '**', 'app-builder-lib', 'templates', 'nsis', 'multiUser.nsh');
  try {
    const result = execSync(`node -e "const g=require('fast-glob');g.sync('${glob.replace(/\\/g, '/')}').forEach(f=>console.log(f))"`, { encoding: 'utf8' });
    const lines = result.trim().split('\n').filter(Boolean);
    if (lines.length > 0) return lines[0];
  } catch { /* */ }

  // Last resort: direct known path pattern
  const candidates = fs.readdirSync(path.join(root, 'node_modules', '.pnpm')).filter(d => d.startsWith('app-builder-lib@'));
  for (const dir of candidates) {
    const p = path.join(root, 'node_modules', '.pnpm', dir, 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'multiUser.nsh');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') return;

  const multiUserPath = findMultiUserNsh();
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

  // Replace the entire SHGetKnownFolderPath block with direct $LocalAppData\Programs
  const regex = /(\s*StrCpy \$0 "\$LocalAppData\\Programs")\s*\n\s*System::Store S\s*\n\s*#[^\n]*\n\s*System::Call 'SHELL32::SHGetKnownFolderPath[^']*'\s*\n\s*\$\{If\} \$1 == 0\s*\n\s*System::Call '\*\$2[^']*'\s*\n\s*StrCpy \$0 \$1\s*\n\s*System::Call 'OLE32::CoTaskMemFree[^']*'\s*\n\s*\$\{endif\}\s*\n\s*System::Store L/;

  if (regex.test(content)) {
    content = content.replace(regex, '$1  ; PATCHED: skip SHGetKnownFolderPath (crash on Win11 24H2/25H2)');
    fs.writeFileSync(multiUserPath, content, 'utf8');
    console.log('[patch-nsis] multiUser.nsh patched — removed SHGetKnownFolderPath crash path');
  } else {
    console.warn('[patch-nsis] regex did not match — check multiUser.nsh manually');
  }
};
