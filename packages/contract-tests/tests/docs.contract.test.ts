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

  it('both public READMEs link the exhaustive inventory', () => {
    expect(readFileSync(join(ROOT, 'README.md'), 'utf8')).toContain('docs/UPSTREAM-FEATURES.md');
    expect(readFileSync(join(ROOT, 'README.en.md'), 'utf8')).toContain('docs/UPSTREAM-FEATURES.md');
  });
});
