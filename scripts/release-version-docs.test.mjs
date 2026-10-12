import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('root and shell package metadata agree on the 0.9.3 source version', () => {
  const rootVersion = JSON.parse(read('package.json')).version;
  const shellVersion = JSON.parse(read('apps/shell/package.json')).version;

  assert.equal(rootVersion, '0.9.3');
  assert.equal(shellVersion, rootVersion);
});

test('bilingual release notes identify the published v0.9.3 Windows assets', () => {
  const notes = read('release-notes-v0.9.3.md');

  assert.match(notes, /^# FreeCode DeepSeek Harness v0\.9\.3/m);
  assert.match(notes, /^## English$/m);
  assert.match(notes, /^## Español$/m);
  assert.match(notes, /v0\.9\.3 is published for Windows x64 with NSIS setup \(~178\.5 MB\) and a portable\s+package \(~651 MB/i);
  assert.match(notes, /portable\s+\(~651 MB/i);
  assert.match(notes, /v0\.9\.3.{0,15}publicada para Windows x64 con setup NSIS/i);
  assert.doesNotMatch(notes, /no v0\.9\.3 tag or release has been created/i);
  assert.match(notes, /opens\s+read-only/i);
  assert.match(notes, /modo de solo lectura/i);
});

test('the changelog leads with 0.9.3 while retaining published 0.9.2 history', () => {
  const changelog = read('CHANGELOG.md');

  assert.match(changelog, /^## 0\.9\.3 — 2026-10-12$/m);
  assert.match(changelog, /bilingual v0\.9\.3 release notes.*release-notes-v0\.9\.3\.md/i);
  assert.ok(changelog.indexOf('## 0.9.3') < changelog.indexOf('## 0.9.2'));
  assert.match(changelog, /Source range: `v0\.9\.2\.\.v0\.9\.3`/);
});

test('English and Spanish READMEs identify v0.9.3 as the latest published release', () => {
  const english = read('README.md');
  const spanish = read('README.es.md');

  assert.match(english, /Source version: 0\.9\.3; latest published release: v0\.9\.3 \(Windows x64\)/i);
  assert.match(spanish, /Versión de la fuente: 0\.9\.3; última release publicada: v0\.9\.3 \(Windows x64\)/i);
  assert.match(english, /v0\.9\.3 release notes/i);
  assert.match(spanish, /notas de la release v0\.9\.3/i);
  assert.match(english, /v0\.9\.3 GitHub release/i);
  assert.match(spanish, /release v0\.9\.3 en GitHub/i);
  assert.match(english, /final v0\.9\.3 release assets are staged under\s+`apps\/shell\/release-0\.9\.3-final\/`/i);
  assert.match(spanish, /artefactos finales de v0\.9\.3 quedan en `apps\/shell\/release-0\.9\.3-final\/`/i);
  assert.match(english, /portable Windows executable \(~651 MB/i);
  assert.match(spanish, /ejecutable portable de Windows \(~651 MB/i);
});

test('release guides and known-issues ledger identify v0.9.3 as the supported baseline', () => {
  const englishRelease = read('docs/RELEASE.md');
  const spanishRelease = read('docs/RELEASE.es.md');
  const knownIssues = read('docs/KNOWN-ISSUES.md');
  const roadmap = read('docs/ROADMAP.md');
  const translations = read('TODO-spanish-translations.md');

  assert.match(englishRelease, /published v0\.9\.3 release is the current Windows x64 baseline/i);
  assert.match(englishRelease, /portable executable \(~651 MB/i);
  assert.match(spanishRelease, /portable v0\.9\.3 \(~651 MB/i);
  assert.match(spanishRelease, /release publicada v0\.9\.3 es la baseline actual para Windows x64/i);
  assert.match(englishRelease, /v0\.9\.3 also prevents older DSH runtimes/i);
  assert.match(spanishRelease, /v0\.9\.3 también evita que runtimes\s+DSH/i);
  assert.match(knownIssues, /Baseline documentada.*Documented baseline: `v0\.9\.3`/i);
  assert.match(knownIssues, /v0\.9\.3 supports Windows x64 only/i);
  assert.match(knownIssues, /v0\.9\.3 sólo se soporta Windows x64/i);
  assert.match(knownIssues, /KI-009.*resolved in v0\.9\.3/is);
  assert.match(knownIssues, /KI-009.*resuelto en v0\.9\.3/is);
  assert.match(knownIssues, /KI-009.*semantic.*tail/is);
  assert.match(knownIssues, /sufijo semántico puede ocultar historial válido/i);
  assert.match(knownIssues, /preserva los bytes originales raw\/Zstandard/i);
  assert.match(knownIssues, /portable is ~651 MB/i);
  assert.match(knownIssues, /portable ~651 MB/i);
  assert.match(roadmap, /^Baseline: `v0\.9\.3`$/m);
  assert.match(roadmap, /^### `v0\.9\.3`/m);
  assert.match(translations, /baseline publicada v0\.9\.3/i);
});

test('current release policy and EN/ES build guidance match the separate-runtime non-interactive gate', () => {
  const policyEn = read('docs/RELEASE-POLICY.md');
  const policyEs = read('docs/RELEASE-POLICY.es.md');
  const readmeEn = read('README.md');
  const readmeEs = read('README.es.md');
  const releaseEn = read('docs/RELEASE.md');
  const releaseEs = read('docs/RELEASE.es.md');

  for (const policy of [policyEn, policyEs]) {
    assert.match(policy, /package:runtime:release/);
    assert.match(policy, /v0\.9\.2/);
    assert.match(policy, /release:gate/);
  }
  assert.match(policyEn, /disposable/i);
  assert.match(policyEs, /desechable/i);
  assert.match(policyEn, /does not install or\s+launch/i);
  assert.match(policyEn, /separate DSH runtime/i);
  assert.match(policyEs, /no instala ni inicia/i);
  assert.match(policyEs, /runtime DSH separado/i);
  assert.match(policyEn, /RELEASE-POLICY\.es\.md/);
  assert.match(policyEs, /RELEASE-POLICY\.md/);

  for (const readme of [readmeEn, readmeEs]) {
    assert.match(readme, /pnpm build:desktop/);
    assert.match(readme, /pnpm release:gate/);
    assert.match(readme, /pnpm verify:desktop-release-assets/);
    assert.match(readme, /apps\/shell\/release-0\.9\.3-final/);
  }
  for (const releaseGuide of [releaseEn, releaseEs]) {
    assert.match(releaseGuide, /package:runtime:release/);
    assert.match(releaseGuide, /release:gate/);
    assert.match(releaseGuide, /release-0\.9\.3-final/);
  }
  assert.match(releaseEn, /disposable/i);
  assert.match(releaseEs, /desechable/i);

  const staleEnBuild = releaseEn.split('## Local Windows build')[1]?.split('## Runtime dependency policy')[0] ?? '';
  const staleEsBuild = releaseEs.match(/## Build local de Windows([\s\S]*?)## Pol.tica de dependencias runtime/)?.[1] ?? '';
  assert.doesNotMatch(staleEnBuild, /pnpm --filter @freecode\/shell package:runtime/);
  assert.doesNotMatch(staleEsBuild, /pnpm --filter @freecode\/shell package:runtime/);
});
