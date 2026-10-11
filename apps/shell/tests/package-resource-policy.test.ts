import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const builderConfig = new URL('../electron-builder.yml', import.meta.url);
const runtimeArchiveScript = new URL('../../../scripts/package-harness-update.mjs', import.meta.url);
const installedSmokeScript = new URL('../../../scripts/verify-nsis-install-layout.mjs', import.meta.url);
const installedRuntimeScript = new URL('../../../scripts/verify-installed-runtime.mjs', import.meta.url);

describe('desktop package payload policy', () => {
  it('keeps the large DSH runtime and its manifest out of setup resources', () => {
    const config = readFileSync(builderConfig, 'utf8');
    const resourcesBlock = config.split('extraResources:')[1]?.split('\nicon:')[0] ?? '';

    expect(resourcesBlock).toContain("'**/*'");
    expect(resourcesBlock).toContain("'!dsh'");
    expect(resourcesBlock).toContain("'!dsh/**'");
    expect(resourcesBlock).toContain("'!runtime-manifest.json'");
  });

  it('uses electron-builder store mode for faster Windows packaging and install', () => {
    const config = readFileSync(builderConfig, 'utf8');

    expect(config).toContain('\ncompression: store\n');
  });

  it('keeps a separately verifiable DSH release archive in the package pipeline', () => {
    const script = readFileSync(runtimeArchiveScript, 'utf8');
    expect(script).toContain("'dsh', 'runtime-manifest.json'");
    expect(script).toContain('.sha256');
  });

  it('validates the actual packaged Electron executable before installer targets are built', () => {
    const config = readFileSync(builderConfig, 'utf8');
    expect(config).toContain('afterPack: build/verify-packaged-electron.cjs');
  });

  it('smokes the downloaded user-data runtime instead of expecting DSH inside the installer', () => {
    const installSmoke = readFileSync(installedSmokeScript, 'utf8');
    const runtimeSmoke = readFileSync(installedRuntimeScript, 'utf8');

    expect(installSmoke).toContain('resources/freecode/opencode2api/opencode2api-win-x64.exe');
    expect(installSmoke).not.toContain('resources/freecode/dsh/apps/cli/lib/bin.js');
    expect(runtimeSmoke).toContain('harness-runtime');
    expect(runtimeSmoke).not.toContain("'resources', 'freecode', 'dsh'");
  });
});
