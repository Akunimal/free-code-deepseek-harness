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
      'https://github.com/0xzr/freellmpool',
      'https://github.com/deepseek-ai/deepseek-harness',
      'https://github.com/rtk-ai/rtk',
      'https://github.com/JuliusBrussee/caveman',
    ]) {
      expect(readme).toContain(url);
      expect(spanishReadme).toContain(url);
    }
    // RTK is mentioned as not bundled in both READMEs
    expect(readme.toLowerCase()).toContain('rtk');
    expect(spanishReadme.toLowerCase()).toContain('rtk');
    expect(readme).toContain('docs/ROADMAP.md');
    expect(spanishReadme).toContain('docs/ROADMAP.md');
    expect(readme).toContain('docs/KNOWN-ISSUES.md');
    expect(spanishReadme).toContain('docs/KNOWN-ISSUES.md');
  });

  it('documents strict live-completion selector eligibility in English and Spanish', () => {
    const releaseNotes = readFileSync(join(ROOT, 'release-notes-v1.0.1.md'), 'utf8');
    const english = `${readFileSync(join(ROOT, 'README.md'), 'utf8')} ${releaseNotes.slice(0, releaseNotes.indexOf('## Español'))}`
      .replace(/\s+/gu, ' ');
    const spanish = `${readFileSync(join(ROOT, 'README.es.md'), 'utf8')} ${releaseNotes.slice(releaseNotes.indexOf('## Español'))}`
      .replace(/\s+/gu, ' ');

    expect(english).toMatch(/valid, non-empty HTTP 200 chat completion/iu);
    expect(english).toMatch(/failed current probes?.{0,120}(?:hidden|removed|disappear)/iu);
    expect(english).toMatch(/selector/iu);
    expect(english).toMatch(/reappear.{0,80}(?:valid|successful) completion/iu);
    expect(spanish).toMatch(/respuesta v\u00e1lida y no vac\u00eda con HTTP 200/iu);
    expect(spanish).toMatch(/(?:fallan|falla).{0,120}(?:se quitan|desaparecen|se ocultan)/iu);
    expect(spanish).toMatch(/selector/iu);
    expect(spanish).toMatch(/(?:reaparece|reaparecen|vuelve|vuelven).{0,80}(?:respuesta|completion) v\u00e1lida/iu);
  });

  it('keeps Caveman optional and the known-issues baseline honest', () => {
    const roadmap = readFileSync(join(ROOT, 'docs/ROADMAP.md'), 'utf8');
    const knownIssues = readFileSync(join(ROOT, 'docs/KNOWN-ISSUES.md'), 'utf8');

    expect(roadmap).toContain('https://github.com/JuliusBrussee/caveman');
    expect(roadmap).toContain('Integrado opcional, desactivado');
    expect(roadmap).toContain('Integrated optional, disabled');
    expect(roadmap).toContain('fail-closed');
    expect(roadmap).toContain('RTK+Caveman');
    // 0.7.0 known issues reflect current state - RTK still not bundled, MCPs still need uvx
    expect(knownIssues).toContain('RTK');
    expect(knownIssues).toContain('Caveman');
    expect(knownIssues).toContain('0.6.0');
  });
});
