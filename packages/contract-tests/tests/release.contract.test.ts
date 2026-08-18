import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');

describe('release and runtime packaging contracts', () => {
  it('keeps release automation tag-only and multiplatform', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8');
    expect(workflow).toMatch(/push:\s*\n\s*tags:\s*\n\s*- ['"]v\*['"]/);
    expect(workflow).not.toMatch(/branches:/);
    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('macos-latest');
    expect(workflow).toContain('ubuntu-latest');
    expect(workflow).toContain('pnpm test:contract');
    expect(workflow).toContain('pnpm build:desktop');
  });

  it('keeps the desktop bundle and native runtime closure wired together', () => {
    const builder = readFileSync(join(ROOT, 'apps/shell/electron-builder.yml'), 'utf8');
    const runtime = readFileSync(join(ROOT, 'scripts/package-runtime.sh'), 'utf8');
    const materializer = readFileSync(join(ROOT, 'scripts/materialize-runtime.mjs'), 'utf8');
    expect(builder).toContain('appId: com.freecode.deepseekharness');
    expect(builder).toContain('from: resources/freecode');
    expect(builder).toContain('icon: build/icon.ico');
    expect(runtime).toContain('--node-linker=hoisted');
    expect(runtime).toContain('materialize-runtime.mjs');
    expect(runtime).not.toContain('--exclude=native');
    expect(materializer).toContain("'native'");
    expect(materializer).toContain("entry.name === '.bin'");
  });
});
