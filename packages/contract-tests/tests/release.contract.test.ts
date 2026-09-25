import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const resolveMcpSdk = createRequire(join(ROOT, 'vendor/deepseek-harness/packages/mcp/mcp-client/package.json'));

/** Every shipped release-notes file, newest last. Kept version-agnostic so a
 *  new release does not require editing this contract (the old test pinned
 *  v0.2.2 and silently stopped covering later releases). */
function releaseNotesFiles(): string[] {
  return readdirSync(join(ROOT, 'docs'))
    .filter((name) => /^RELEASE-NOTES-v\d+\.\d+\.\d+\.md$/.test(name))
    .sort();
}

describe('release and runtime packaging contracts', () => {
  it('keeps releases manual and Windows-only for 0.6.0', () => {
    const rootPackage = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: string };
    const shellPackageJson = JSON.parse(readFileSync(join(ROOT, 'apps/shell/package.json'), 'utf8')) as { version?: string };
    const shellPackage = readFileSync(join(ROOT, 'apps/shell/package.json'), 'utf8');
    const rootScripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const policy = readFileSync(join(ROOT, 'docs/RELEASE-POLICY.md'), 'utf8');
    expect(existsSync(join(ROOT, '.github/workflows/release.yml'))).toBe(false);
    expect(policy).toContain('performed manually');
    expect(policy).toContain('free GitHub Actions quota');
    expect(shellPackage).toContain('electron-builder --config electron-builder.yml --publish never');
    expect(rootScripts.scripts?.['release:gate']).toBe('node scripts/release-gate.mjs');
    expect(rootScripts.scripts?.['build:vendor']).toContain('scripts/build-vendor-local.mjs');
    const releaseGate = readFileSync(join(ROOT, 'scripts/release-gate.mjs'), 'utf8');
    expect(releaseGate).toContain("runGit('whitespace validation', ['diff', '--check'])");
    expect(releaseGate).toContain("run('all workspace tests', ['test'])");
    expect(releaseGate).toContain("run('all workspace contract tests', ['test:contract'])");
    expect(releaseGate).toContain("run('all workspace typechecks', ['typecheck'])");
    expect(releaseGate).toContain("run('fresh NSIS install and installed-runtime smoke'");
    expect(releaseGate).not.toContain('0.4.3 to candidate upgrade');
    expect(rootPackage.version).toBe('0.8.0');
    expect(shellPackageJson.version).toBe(rootPackage.version);
  });

  it('keeps README and release descriptions bilingual', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const spanishReadme = readFileSync(join(ROOT, 'README.es.md'), 'utf8');
    const template = readFileSync(join(ROOT, 'docs/RELEASE-NOTES-TEMPLATE.md'), 'utf8');
    expect(readme).toContain('[Leer en español](README.es.md)');
    expect(readme).toMatch(/^## English$/m);
    expect(readme).toMatch(/^## Español$/m);
    expect(readme).toContain('OpenCode Free models');
    expect(readme).toContain('modelos OpenCode Free');
    expect(readme).not.toContain('DeepSeek Free');
    expect(spanishReadme).toContain('modelos OpenCode Free');
    expect(spanishReadme).not.toContain('DeepSeek Free');
    expect(spanishReadme).toContain('[Read this in English](README.md)');
    // The template plus every shipped release-notes file must be bilingual.
    const notesFiles = releaseNotesFiles();
    expect(notesFiles.length).toBeGreaterThan(0);
    for (const file of ['RELEASE-NOTES-TEMPLATE.md', ...notesFiles]) {
      const notes = file === 'RELEASE-NOTES-TEMPLATE.md' ? template : readFileSync(join(ROOT, 'docs', file), 'utf8');
      expect(notes, file).toMatch(/^## English$/m);
      expect(notes, file).toMatch(/^## Español$/m);
    }
  });

  it('keeps the desktop bundle and native runtime closure wired together', () => {
    const builder = readFileSync(join(ROOT, 'apps/shell/electron-builder.yml'), 'utf8');
    const runtime = readFileSync(join(ROOT, 'scripts/package-runtime.sh'), 'utf8');
    const materializer = readFileSync(join(ROOT, 'scripts/materialize-runtime.mjs'), 'utf8');
    const icon = readFileSync(join(ROOT, 'apps/shell/build/icon.ico'));
    const pngIcon = readFileSync(join(ROOT, 'apps/shell/build/icon.png'));
    expect(builder).toContain('appId: com.freecode.deepseekharness');
    expect(builder).toContain('from: resources/freecode');
    expect(builder).toContain('icon: build/icon.png');
    expect(builder).toContain('  icon: build/icon.ico');
    expect(builder).toContain('shortcutName: FreeCode DeepSeek Harness');
    expect(builder).toContain('createStartMenuShortcut: true');
    expect(builder).toContain('createDesktopShortcut: always');
    expect(pngIcon.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(pngIcon.readUInt32BE(16)).toBeGreaterThanOrEqual(512);
    expect(pngIcon.readUInt32BE(20)).toBeGreaterThanOrEqual(512);
    expect(builder).toContain('- portable');
    expect(builder).toContain('artifactName: FreeCode-DeepSeek-Harness-${version}-${os}-${arch}-portable.${ext}');
    expect(builder).toContain('owner: Akunimal');
    expect(builder).toContain('repo: free-code-deepseek-harness');
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    const icoEntryCount = icon.readUInt16LE(4);
    expect(icoEntryCount).toBeGreaterThanOrEqual(1);
    const has256 = Array.from({ length: icoEntryCount }, (_, i) => icon[6 + i * 16]).some(w => w === 0);
    expect(has256).toBe(true); // At least one 256px entry (width byte 0 = 256).
    expect(runtime).toContain('--node-linker=hoisted');
    expect(runtime).toContain('upstreamCommit');
    expect(runtime).toContain('git-subtree-split');
    expect(runtime).toContain('materialize-runtime.mjs');
    expect(runtime).toContain('rebuild-runtime-native.mjs');
    expect(runtime).toContain('0.6.0 is Windows-only');
    expect(runtime).toContain('opencode2api-win-x64.exe');
    expect(runtime).not.toContain('opencode2api-linux-x64');
    expect(runtime).not.toContain('opencode2api-mac-x64');
    expect(runtime).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(runtime).not.toContain('--exclude=native');
    expect(materializer).toContain("'native'");
    expect(materializer).toContain('removeNestedNodeModules');
    expect(materializer).toContain("path.join(stage, 'node_modules', '.bin')");
    expect(materializer).toContain('recursively searching them for');
  });

  it('keeps the FreeCode browser, update indicator, and naming contracts aligned', () => {
    const browser = readFileSync(join(ROOT, 'apps/shell/src/main/embedded-browser.ts'), 'utf8');
    const shell = readFileSync(join(ROOT, 'apps/shell/src/main/index.ts'), 'utf8');
    const updater = readFileSync(join(ROOT, 'apps/shell/src/main/updater.ts'), 'utf8');
    const i18n = readFileSync(join(ROOT, 'apps/shell/src/main/i18n.ts'), 'utf8');
    const browserTool = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/web/tool-web/src/browser.ts'), 'utf8');
    const sidebar = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/client/ui-sidebar/src/client/SidebarRoot.tsx'), 'utf8');
    const compaction = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/compaction/compaction-basic/src/config.ts'), 'utf8');
    const rtk = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/shell/shell/src/rtk.ts'), 'utf8');
    expect(browser).toContain('new WebContentsView');
    expect(browser).toContain('session.fromPath');
    expect(browser).toContain('browser-state.json');
    expect(browser).toContain('contentView.addChildView');
    expect(browser).not.toContain('new BrowserWindow');
    expect(browser).toContain("window.open('freecode://browser/' + value, '_blank')");
    expect(browser).toContain('function normalizeAddress');
    expect(browser).toContain('https://${trimmed}');
    expect(browser).toContain('const mainContentView = mainWindow.contentView.children.find');
    expect(browser).toContain('(mainContentView as WebContentsView).setBounds(bounds.main)');
    expect(browserTool).toContain("'tabs'");
    expect(browserTool).toContain("'new_tab'");
    expect(browserTool).toContain('computer_use');
    expect(sidebar).toContain('fallbackBrandName}>FreeCode');
    expect(sidebar).toContain('localBuildTitle}>FreeCode');
    expect(shell).toContain('setInterval(() => void checkForUpdates()');
    expect(shell).toContain('freecode://updates/open');
    expect(shell).toContain("document.querySelector('button[aria-haspopup=\"dialog\"]')");
    expect(shell).not.toContain('{ x: 6, y: Math.max(0, height - 42)');
    expect(shell).toContain('isNewerVersion(app.getVersion(), result?.info?.version)');
    expect(shell).toContain("t('menu.aboutMessage', app.getVersion())");
    expect(i18n).toContain('Version $1');
    const indicatorStart = shell.indexOf('function renderUpdateIndicatorHtml');
    const indicatorEnd = shell.indexOf('function updateUpdateIndicatorBounds', indicatorStart);
    const indicator = shell.slice(indicatorStart, indicatorEnd);
    expect(indicator).toContain('width:34px;height:34px');
    expect(indicator).toContain('border-radius:999px');
    expect(indicator).toContain('<button type="button"');
    expect(indicator).toContain('rotate(180 8 8)');
    expect(shell).toContain('UPDATE_INDICATOR_WIDTH');
    expect(updater).toContain('downloadUpdate; refusing to install');
    expect(shell).toContain("setUpdateActivity('downloading')");
    expect(shell).toContain("t('tray.updateDownloading')");
    expect(shell).toContain('notifyUpdateDownloading');
    expect(shell).not.toContain("t('menu.checkUpdates')");
    const terminal = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/subprocess/subprocess-local/src/index.ts'), 'utf8');
    expect(terminal).toContain("import * as nodePty from 'node-pty'");
    expect(terminal).toContain('spawnSubprocess');
    expect(compaction).toContain('DEFAULT_THRESHOLD_RATIO = 0.8');
    expect(rtk).toContain('spawnSync');
    expect(rtk).toContain('return false');
  });

  it('keeps embedded MCP and child-process headless contracts explicit', () => {
    const mcpConfig = readFileSync(join(ROOT, 'scripts/mcp-config.mjs'), 'utf8');
    const mcpHome = readFileSync(join(ROOT, 'apps/shell/src/main/mcp-home.ts'), 'utf8');
    const runtime = readFileSync(join(ROOT, 'apps/shell/src/main/runtime.ts'), 'utf8');
    const serenaLauncher = readFileSync(join(ROOT, 'apps/shell/resources/freecode/serena-headless-launcher.py'), 'utf8');
    const supervisor = readFileSync(join(ROOT, 'apps/shell/src/main/harness-supervisor.ts'), 'utf8');
    const updater = readFileSync(join(ROOT, 'apps/shell/src/main/harness-updater.ts'), 'utf8');
    const mcpTransport = readFileSync(join(ROOT, 'vendor/deepseek-harness/packages/mcp/mcp-client/src/transport.ts'), 'utf8');
    // PNPM may expose the SDK through a virtual-store path rather than a
    // physical vendor/node_modules/@scope symlink. Resolve it with the same
    // package boundary Node uses at runtime.
    const sdkStdio = readFileSync(resolveMcpSdk.resolve('@modelcontextprotocol/sdk/client/stdio.js'), 'utf8');

    // Two distinct managed rows must remain present in the shell catalog;
    // the scripts catalog (scripts/mcp-config.mjs) still pins serena +
    // free-search (pre-existing drift, out of scope for 0.8.0 gentle-ai
    // migration which owns apps/shell/src/main/mcp-home.ts). The shell
    // catalog migrated serena -> engram per the gentle-ai MCP spec.
    for (const id of ['serena', 'free-search']) {
      expect(mcpConfig, id).toContain(`id: '${id}'`);
    }
    for (const id of ['engram', 'free-search']) {
      expect(mcpHome, id).toContain(`id: '${id}'`);
    }
    expect(mcpHome).not.toContain(`id: 'serena'`);
    expect(mcpHome).not.toContain('FREECODE_MCP_SERENA_ENABLED');
    expect(mcpConfig).not.toContain('mcp-language-server');
    expect(mcpConfig).not.toContain('@anthropic-ai/serena-mcp');
    expect(mcpConfig).not.toContain('@isaacphi/mcp-language-server');

    // A future upstream refresh must not reintroduce visible console flashes
    // for either the shell-owned child or update extraction.
    expect(supervisor).toContain('HIDDEN_CHILD_PROCESS_OPTIONS');
    expect(supervisor).toContain('windowsHide: true');
    expect(supervisor).toContain('shell: false');
    // Updater uses centralized launch seam (launchHiddenSync) which enforces windowsHide
    expect(updater).toContain('launchHiddenSync');
    expect(mcpTransport).toContain('new StdioClientTransport');
    expect(mcpTransport).toContain("stderr: 'pipe'");
    expect(sdkStdio).toMatch(/windowsHide:\s+(?:process|node_process_1\.default)\.platform === 'win32'/);
    // Serena launcher retired from the runtime path with the Engram
    // migration (mcp-home no longer passes serenaLauncherPath). The
    // launcher file itself still ships until packaging cleanup.
    expect(runtime).not.toContain('serena-headless-launcher.py');
    expect(serenaLauncher).toContain('shell=False');
    expect(serenaLauncher).toContain('CREATE_NO_WINDOW');
    expect(serenaLauncher).toContain('ManagedSubprocessLauncher.launch');
  });

  it('guards the NSIS runtime truncation regression', () => {
    const installer = readFileSync(join(ROOT, 'apps/shell/build/installer.nsh'), 'utf8');
    const patcher = readFileSync(join(ROOT, 'apps/shell/build/patch-nsis.cjs'), 'utf8');
    const smoke = readFileSync(join(ROOT, 'scripts/verify-nsis-install-layout.mjs'), 'utf8');
    const upgradeSmoke = readFileSync(join(ROOT, 'scripts/verify-nsis-upgrade.mjs'), 'utf8');
    const shortcutSmoke = readFileSync(join(ROOT, 'scripts/verify-nsis-shortcuts.mjs'), 'utf8');
    const installedRuntime = readFileSync(join(ROOT, 'scripts/verify-installed-runtime.mjs'), 'utf8');
    expect(installedRuntime).toContain('const DEFAULT_TIMEOUT_MS = 180_000');
    const hookGate = readFileSync(join(ROOT, 'scripts/verify-nsis-hooks.mjs'), 'utf8');
    const preflight = readFileSync(join(ROOT, 'apps/shell/src/main/preflight.ts'), 'utf8');

    // customInit was mistakenly treated as a pre-extraction hook, while
    // customInstall is post-extraction. Either one can silently leave the
    // shipped dsh workspace empty when used for cleanup.
    expect(installer).not.toMatch(/!macro\s+customInit\b/i);
    expect(installer).not.toMatch(/!macro\s+customInstall\b[\s\S]*?RMDir\s+\/r/i);
    expect(installer).toContain('!macro freecodePrepareInstall');
    expect(installer).toContain('!macro customInstall');
    expect(installer).toContain('SetOutPath "$INSTDIR"');
    expect(installer).toContain('CreateShortCut "$newStartMenuLink"');
    expect(installer).toContain('CreateShortCut "$newDesktopLink"');
    expect(installer).toContain('WinShell::SetLnkAUMI "$newStartMenuLink"');
    expect(installer).toContain('WinShell::SetLnkAUMI "$newDesktopLink"');
    expect(patcher).toContain('patchInstallSection');
    expect(patcher).toContain('!insertmacro freecodePrepareInstall');
    expect(hookGate).toContain('customInit is not a supported');
    expect(hookGate).toContain('shortcut repair contract');
    expect(smoke).toContain('readdirSync(target).length === 0');
    expect(smoke).toContain('packages');
    expect(smoke).toContain('node_modules');
    expect(smoke).toContain('verifyInstalledShortcuts');
    expect(smoke).toContain('cleanupInstalledShortcuts');
    expect(upgradeSmoke).toContain('verifyInstalledShortcuts');
    expect(upgradeSmoke).toContain('cleanupInstalledShortcuts');
    expect(shortcutSmoke).toContain("GetFolderPath('CommonApplicationData')");
    expect(shortcutSmoke).toContain("Get-ChildItem -LiteralPath $root -Filter '${SHORTCUT_NAME}.lnk'");
    expect(shortcutSmoke).toContain('workingDirectory');
    expect(upgradeSmoke).toContain('0.4.3');
    expect(upgradeSmoke).toContain('rootPackage');
    expect(upgradeSmoke).toContain('stale ${STABLE_VERSION} payload marker survived upgrade');
    expect(upgradeSmoke).toContain('user-data marker was deleted by upgrade');
    expect(patcher).toContain('dead uninstall helpers');
    expect(installedRuntime).toContain('visible descendant window detected');
    expect(installedRuntime).toContain('harness runtime preflight failed');
    expect(installedRuntime).toContain('harness supervisor gave up');
    expect(installedRuntime).toContain('harness ready');
    expect(installedRuntime).toContain('timeout: 120_000');

    // Preflight is bundled as ESM. A CommonJS require here throws at runtime,
    // and the catch converts the failure into a false "empty" directory.
    expect(preflight).toContain("import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';");
    expect(preflight).not.toContain("require('node:fs')");
  });
});
