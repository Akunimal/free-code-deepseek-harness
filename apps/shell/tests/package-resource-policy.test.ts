import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const builderConfig = new URL('../electron-builder.yml', import.meta.url);
const runtimeArchiveScript = new URL('../../../scripts/package-harness-update.mjs', import.meta.url);
const installedSmokeScript = new URL('../../../scripts/verify-nsis-install-layout.mjs', import.meta.url);
const installedRuntimeScript = new URL('../../../scripts/verify-installed-runtime.mjs', import.meta.url);
const packagedElectronVerifier = new URL('../build/verify-packaged-electron.cjs', import.meta.url);
const rootPackage = new URL('../../../package.json', import.meta.url);
const shellPackage = new URL('../package.json', import.meta.url);

describe('desktop package payload policy', () => {
  it('excludes the large DSH runtime but packages its small compatibility manifest', () => {
    const config = readFileSync(builderConfig, 'utf8');
    const resourcesBlock = config.split('extraResources:')[1]?.split('\nicon:')[0] ?? '';

    expect(resourcesBlock).toContain("'**/*'");
    expect(resourcesBlock).toContain("'!dsh'");
    expect(resourcesBlock).toContain("'!dsh/**'");
    expect(resourcesBlock).not.toContain("'!runtime-manifest.json'");
  });

  it('uses electron-builder store mode for faster Windows packaging and install', () => {
    const config = readFileSync(builderConfig, 'utf8');

    expect(config).toContain('\ncompression: store\n');
  });

  it('keeps a separately verifiable DSH release archive in the package pipeline', () => {
    const script = readFileSync(runtimeArchiveScript, 'utf8');
    expect(script).toContain("'dsh', 'runtime-manifest.json'");
    expect(script).toContain('.sha256');
    expect(script).toContain('assertRuntimeArchiveDestinationIsFree');
    expect(script).not.toContain('rmSync(archivePath');
  });

  it('keeps ordinary desktop packaging separate from immutable runtime archive generation', () => {
    const rootScripts = JSON.parse(readFileSync(rootPackage, 'utf8')).scripts;
    const shellScripts = JSON.parse(readFileSync(shellPackage, 'utf8')).scripts;

    expect(shellScripts.package).not.toContain('package-harness-update');
    expect(rootScripts['build:desktop']).not.toContain('package:runtime');
    expect(rootScripts['package:runtime:release']).toContain('package:runtime');
    expect(rootScripts['package:runtime:release']).toContain('package-harness-update');
  });

  it('uses a package-versioned, configurable output path for the desktop package wrapper', () => {
    const wrapper = readFileSync(new URL('../../../scripts/package-desktop.mjs', import.meta.url), 'utf8');
    const shellScripts = JSON.parse(readFileSync(shellPackage, 'utf8')).scripts;

    expect(shellScripts.package).toContain('package:desktop');
    expect(shellScripts['package:desktop']).toContain('package-desktop.mjs');
    expect(wrapper).toContain('FREECODE_RELEASE_OUTPUT');
    expect(wrapper).toContain('release-${version}-local');
    expect(wrapper).toContain("resolve(shellRoot, 'release')");
    expect(wrapper).toContain("resolve('electron-builder/cli.js')");
  });

  it('validates the actual packaged Electron executable before installer targets are built', () => {
    const config = readFileSync(builderConfig, 'utf8');
    expect(config).toContain('afterPack: build/verify-packaged-electron.cjs');
  });

  it('ships no Tor runtime in the packaged desktop payload', () => {
    const shellScripts = JSON.parse(readFileSync(shellPackage, 'utf8')).scripts;
    const packagedVerifier = readFileSync(packagedElectronVerifier, 'utf8');

    expect(shellScripts['prepackage:verify']).not.toContain('verify-tor-runtime-assets');
    expect(packagedVerifier).not.toContain('verifyTorRuntimeAssets');
    expect(readFileSync(builderConfig, 'utf8')).not.toMatch(/'!tor(\/\*\*)?'/);
  });

  it('smokes the downloaded user-data runtime instead of expecting DSH inside the installer', () => {
    const installSmoke = readFileSync(installedSmokeScript, 'utf8');
    const runtimeSmoke = readFileSync(installedRuntimeScript, 'utf8');

    expect(installSmoke).toContain('resources/freecode/opencode2api/opencode2api-win-x64.exe');
    expect(installSmoke).not.toContain('resources/freecode/tor/');
    expect(installSmoke).not.toContain('resources/freecode/dsh/apps/cli/lib/bin.js');
    expect(runtimeSmoke).toContain('harness-runtime');
    expect(runtimeSmoke).not.toContain("'resources', 'freecode', 'dsh'");
  });
});
