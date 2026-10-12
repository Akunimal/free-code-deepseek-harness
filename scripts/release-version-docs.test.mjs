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

test('the current bilingual release notes describe only an unreleased candidate', () => {
  const notes = read('release-notes-v0.9.3.md');

  assert.match(notes, /^# FreeCode DeepSeek Harness v0\.9\.3/m);
  assert.match(notes, /^## English$/m);
  assert.match(notes, /^## Español$/m);
  assert.match(notes, /setup and portable packages have not been built/i);
  assert.match(notes, /todavía no se compilaron setup ni portable/i);
  assert.match(notes, /opens\s+read-only/i);
  assert.match(notes, /modo de solo lectura/i);
});

test('the changelog leads with 0.9.3 while retaining published 0.9.2 history', () => {
  const changelog = read('CHANGELOG.md');

  assert.match(changelog, /^## 0\.9\.3 — In development \(unreleased\)$/m);
  assert.match(changelog, /bilingual v0\.9\.3 release notes.*release-notes-v0\.9\.3\.md/i);
  assert.ok(changelog.indexOf('## 0.9.3') < changelog.indexOf('## 0.9.2'));
  assert.match(changelog, /Source range: `v0\.9\.1\.\.v0\.9\.2`/);
});

test('English and Spanish READMEs separate source 0.9.3 from released 0.9.2', () => {
  const english = read('README.md');
  const spanish = read('README.es.md');

  assert.match(english, /Source version: 0\.9\.3 in development; latest published release: v0\.9\.2/i);
  assert.match(spanish, /Versión de la fuente: 0\.9\.3 en desarrollo; última release publicada: v0\.9\.2/i);
  assert.match(english, /v0\.9\.3 release notes \(unreleased\)/i);
  assert.match(spanish, /notas de la release v0\.9\.3 \(sin publicar\)/i);
});

test('release guides and known-issues ledger distinguish the unreleased recovery fix', () => {
  const englishRelease = read('docs/RELEASE.md');
  const spanishRelease = read('docs/RELEASE.es.md');
  const knownIssues = read('docs/KNOWN-ISSUES.md');

  assert.match(englishRelease, /Source candidate: v0\.9\.3 \(unreleased\)/i);
  assert.match(spanishRelease, /Candidato de código: v0\.9\.3 \(sin publicar\)/i);
  assert.match(knownIssues, /KI-009.*semantic.*tail/is);
  assert.match(knownIssues, /sufijo semántico puede ocultar historial válido/i);
  assert.match(knownIssues, /preserva los bytes originales raw\/Zstandard/i);
});
