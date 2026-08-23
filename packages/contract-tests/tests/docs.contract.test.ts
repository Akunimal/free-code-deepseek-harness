import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const VENDOR = join(ROOT, 'vendor/deepseek-harness');

function upstreamPackageNames(): string[] {
  const root = join(VENDOR, 'packages');
  return readdirSync(root, { withFileTypes: true })
    .filter((group) => group.isDirectory())
    .flatMap((group) => {
      const groupRoot = join(root, group.name);
      return readdirSync(groupRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(groupRoot, entry.name, 'package.json')))
        .map((entry) => JSON.parse(readFileSync(join(groupRoot, entry.name, 'package.json'), 'utf8')).name as string);
    })
    .sort();
}

describe('documentation feature inventory', () => {
  it('explains every declared upstream package', () => {
    const inventory = readFileSync(join(ROOT, 'docs/UPSTREAM-FEATURES.md'), 'utf8');
    for (const packageName of upstreamPackageNames()) {
      expect(inventory, `missing upstream package: ${packageName}`).toContain(`**${packageName}**`);
    }
  });

  it('the English primary README and Spanish companion link the exhaustive inventory', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const spanishReadme = readFileSync(join(ROOT, 'README.es.md'), 'utf8');
    expect(readme).toContain('docs/UPSTREAM-FEATURES.md');
    expect(spanishReadme).toContain('docs/UPSTREAM-FEATURES.md');
    expect(readme).toContain('README.es.md');
    expect(spanishReadme).toContain('README.md');
    for (const url of [
      'https://github.com/jasonxu114514/opencode2api',
      'https://github.com/deepseek-ai/deepseek-harness',
      'https://github.com/rtk-ai/rtk',
    ]) {
      expect(readme).toContain(url);
      expect(spanishReadme).toContain(url);
    }
    expect(readme).toContain('RTK is not bundled, downloaded, or installed by FreeCode');
    expect(spanishReadme).toContain('FreeCode no incluye, descarga ni instala RTK');
  });
});
