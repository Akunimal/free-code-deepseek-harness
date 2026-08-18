import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');

describe('release and runtime packaging contracts', () => {
  it('keeps release automation tag-only and multiplatform', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8');
    const shellPackage = readFileSync(join(ROOT, 'apps/shell/package.json'), 'utf8');
    expect(workflow).toMatch(/push:\s*\n\s*tags:\s*\n\s*- ['"]v\*['"]/);
    expect(workflow).not.toMatch(/branches:/);
    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('macos-latest');
    expect(workflow).toContain('ubuntu-latest');
    expect(workflow).toContain('pnpm test:contract');
    expect(workflow).toContain('pnpm build:desktop');
    expect(shellPackage).toContain('electron-builder --config electron-builder.yml --publish never');
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
    expect(pngIcon.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(pngIcon.readUInt32BE(16)).toBeGreaterThanOrEqual(512);
    expect(pngIcon.readUInt32BE(20)).toBeGreaterThanOrEqual(512);
    expect(builder).toContain('- portable');
    expect(builder).toContain('artifactName: FreeCode-DeepSeek-Harness-${version}-${os}-${arch}-portable.${ext}');
    expect(builder).toContain('owner: Akunimal');
    expect(builder).toContain('repo: free-code-deepseek-harness');
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    expect(icon[6]).toBe(0); // ICO width byte 0 means 256px.
    expect(icon[7]).toBe(0); // ICO height byte 0 means 256px.
    expect(runtime).toContain('--node-linker=hoisted');
    expect(runtime).toContain('upstreamCommit');
    expect(runtime).toContain('git-subtree-split');
    expect(runtime).toContain('materialize-runtime.mjs');
    expect(runtime).not.toContain('--exclude=native');
    expect(materializer).toContain("'native'");
    expect(materializer).toContain("entry.name === '.bin'");
  });
});
