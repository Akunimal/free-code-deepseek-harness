import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('root and shell package metadata agree on the published 0.9.4 source version', () => {
  const rootVersion = JSON.parse(read('package.json')).version;
  const shellVersion = JSON.parse(read('apps/shell/package.json')).version;

  assert.equal(rootVersion, '0.9.4');
  assert.equal(shellVersion, rootVersion);
});

test('bilingual release notes identify the published v0.9.3 Windows assets', () => {
  const notes = read('release-notes-v0.9.3.md');

  assert.match(notes, /^# FreeCode DeepSeek Harness v0\.9\.3/m);
  assert.match(notes, /^## English$/m);
  assert.match(notes, /^## Español$/m);
  assert.match(notes, /v0\.9\.3 is published for Windows x64 with NSIS setup \(~178\.5 MB\) and a portable\s+package \(~178\.2 MB \/ 169\.9 MiB\)/i);
  assert.match(notes, /package\s+\(~178\.2 MB \/ 169\.9 MiB\)/i);
  assert.match(notes, /178,543,845 bytes[\s\S]{0,100}53dfde329731d19081204a82bbbafc4678f4c81b4588a22884ef49064f400cd5/i);
  assert.match(notes, /178,169,861 bytes[\s\S]{0,100}830eba7ca48d2ee56d2272dfa1d2d23684f5cc7507db55d7617dbc6ed8cd12d3/i);
  assert.match(notes, /v0\.9\.3.{0,15}publicada para Windows x64 con setup NSIS/i);
  assert.match(notes, /portable\s+\(~178,2 MB \/ 169,9 MiB\)/i);
  assert.doesNotMatch(notes, /no v0\.9\.3 tag or release has been created/i);
  assert.match(notes, /opens\s+read-only/i);
  assert.match(notes, /modo de solo lectura/i);
});

test('bilingual 0.9.4 notes identify the published release and retain candidate history', () => {
  const notes = read('release-notes-v0.9.4.md');
  const english = notes.split('## English')[1]?.split('## Español')[0] ?? '';
  const spanish = notes.split('## Español')[1] ?? '';
  const currentEnglish = english.split('### Previous local')[0] ?? english;
  const currentSpanish = spanish.split('### Candidata local anterior')[0] ?? spanish;

  assert.match(notes, /^# FreeCode DeepSeek Harness v0\.9\.4/m);
  assert.match(notes, /^## English$/m);
  assert.match(notes, /^## Español$/m);
  assert.match(currentEnglish, /v0\.9\.4 is published for Windows x64/i);
  assert.match(currentSpanish, /v0\.9\.4 se public[oó] para Windows x64/i);
  assert.match(notes, /opencode2api v1\.4\.0/i);
  assert.match(notes, /SAFECOOKIE[\s\S]*bootstrap/i);
  assert.match(english, /Gentle AI[\s\S]*Standard remains the default/i);
  assert.match(spanish, /Gentle AI[\s\S]*Standard sigue siendo el modo predeterminado/i);
  assert.match(english, /release-0\.9\.4-alpha5-candidate-20261014/);
  assert.match(english, /178,630,999 bytes,\s+SHA-256\s+`3117054ba2ee29c6c9993e7f7cdd525262f8d39e4f037e037c411142659d8a08`/);
  assert.match(english, /178,255,861 bytes, SHA-256\s+`79e03080494efcd9fc9f06311b1b4f78238e57b97fd2ea00ba97baa5513f520b`/);
  assert.match(english, /setup\s+was executed[\s\S]{0,100}NSIS\s+returned exit code 0/i);
  assert.match(spanish, /setup[\s\S]{0,100}se ejecutó[\s\S]{0,100}código 0/i);
  assert.match(english, /No harness runtime asset for packaged version 0\.2\.1-alpha\.4 \(win32-x64\)/i);
  assert.match(spanish, /No harness runtime asset for packaged version 0\.2\.1-alpha\.4 \(win32-x64\)/i);
  assert.match(english, /matching alpha5 runtime had been locally precached/i);
  assert.match(spanish, /precargar localmente el runtime alpha5/i);
  assert.match(english, /user then tried[\s\S]{0,120}only one model[\s\S]{0,120}(?:connection|protocol|access)/i);
  assert.match(spanish, /el usuario probó[\s\S]{0,120}solo\s+aparece un modelo[\s\S]{0,120}(?:conexión|protocolo|acceso)/i);
});

test('V094-21 candidate documentation supersedes the pre-fix installer and records the model/Tor corrections', () => {
  const notes = read('release-notes-v0.9.4.md');
  const english = notes.split('## English')[1]?.split('## Español')[0] ?? '';
  const spanish = notes.split('## Español')[1] ?? '';

  assert.match(english, /V094-21[\s\S]*seed the\s+live provider catalog before starting DSH/i);
  assert.match(english, /Muse Spark[\s\S]{0,120}16-token output budget/i);
  assert.match(english, /do not cool Direct\/Tor[\s\S]{0,100}HTTP 400\/401\/403/i);
  assert.match(spanish, /V094-21[\s\S]*Se siembra el catálogo antes de iniciar DSH/i);
  assert.match(spanish, /mínimo de 16 tokens[\s\S]{0,80}Muse Spark/i);
  assert.match(spanish, /HTTP 400\/401\/403 ya no enfrían Direct\/Tor/i);
  assert.match(english, /Both now\s+pass in isolation[\s\S]{0,100}Tor 1\/1[\s\S]{0,140}supervisor 5\/5/i);
  assert.match(spanish, /Ambos\s+ahora pasan aislados[\s\S]{0,100}Tor 1\/1[\s\S]{0,140}supervisor 5\/5/i);
  assert.match(english, /That prior candidate[\s\S]{0,900}Its release gate passed and its local setup\/portable assets were statically verified/i);
  assert.match(spanish, /El gate completo no interactivo pasó y la verificación estática de assets/i);
  assert.match(notes, /Setup 0\.9\.4 \| 178,750,879 bytes \| `1e48c6c866a7b52d422eb62b852ffece4b6c5435aa3bbd490960e28395463440`/i);
  assert.match(notes, /Portable 0\.9\.4 \| 178,375,755 bytes \| `91f720be4c140477d4d8b9d62b2cc2ba4a0fe97858d7551b38de60b7a2e3cba6`/i);

  const pendingBuildDir = 'release-0.9.4-final-20261016';
  const activeDocs = [
    read('README.md'), read('README.es.md'), read('docs/RELEASE.md'),
    read('docs/RELEASE.es.md'), read('docs/RELEASE-POLICY.md'),
    read('docs/RELEASE-POLICY.es.md'), read('docs/ROADMAP.md'),
  ];
  for (const document of activeDocs) {
    assert.ok(document.includes(pendingBuildDir), `expected rebuild target ${pendingBuildDir}`);
    assert.match(document, /V094-21/i);
    assert.match(document, /V094-35/i);
    assert.match(document, /V094-35/i);
    assert.match(document, /release gate[\s\S]{0,100}passed|gate de release[\s\S]{0,100}pas[oó]|gate completo no interactivo pas[oó]/i);
  }
});

test('active bilingual release docs identify alpha8 and the catalog, animation, model-metadata and profile changes', () => {
  for (const file of ['README.md', 'README.es.md', 'docs/RELEASE.md', 'docs/RELEASE.es.md',
    'docs/RELEASE-POLICY.md', 'docs/RELEASE-POLICY.es.md', 'docs/ROADMAP.md', 'release-notes-v0.9.4.md']) {
    const source = read(file);
    assert.match(source, /0\.2\.1-alpha\.8/, file);
    assert.match(source, /Hermes/, file);
    assert.match(source, /cordis\.patch\.yml/, file);
    assert.match(source, /1\.4\.0/, file);
    assert.match(source, /V094-37/i, file);
    assert.match(source, /V094-38/i, file);
    assert.match(source, /V094-39/i, file);
    assert.doesNotMatch(source, /therefore pins `0\.2\.1-alpha\.5`|source now pins DSH alpha5/i, file);
  }
});

test('the changelog leads with the verified published 0.9.4 release and retains history', () => {
  const changelog = read('CHANGELOG.md');

  assert.match(changelog, /^## 0\.9\.4 — Published — 2026-10-16$/m);
  assert.match(changelog, /0\.2\.1-alpha\.8/);
  assert.match(changelog, /V094-37/);
  assert.match(changelog, /V094-38/);
  assert.match(changelog, /V094-39/);
  assert.match(changelog, /setup and portable binaries were built and statically verified/i);
  assert.match(changelog, /bilingual v0\.9\.4 release notes.*release-notes-v0\.9\.4\.md/i);
  assert.match(changelog, /^## 0\.9\.3 — 2026-10-12$/m);
  assert.ok(changelog.indexOf('## 0.9.4') < changelog.indexOf('## 0.9.3'));
  assert.ok(changelog.indexOf('## 0.9.3') < changelog.indexOf('## 0.9.2'));
  assert.match(changelog, /bilingual v0\.9\.3 release notes.*release-notes-v0\.9\.3\.md/i);
  assert.match(changelog, /Source range: `v0\.9\.2\.\.v0\.9\.3`/);
});

test('English and Spanish READMEs identify v0.9.4 as the latest published release', () => {
  const english = read('README.md');
  const spanish = read('README.es.md');

  assert.match(english, /Source version: 0\.9\.4 \(published\); latest published release: v0\.9\.4 \(Windows x64\)/i);
  assert.match(spanish, /Versión de la fuente: 0\.9\.4 \(publicada\); última release publicada: v0\.9\.4 \(Windows x64\)/i);
  assert.match(english, /v0\.9\.4 release notes/i);
  assert.match(spanish, /notas de la release v0\.9\.4/i);
  assert.match(english, /v0\.9\.3 release notes/i);
  assert.match(spanish, /notas de la release v0\.9\.3/i);
  assert.match(english, /v0\.9\.4 GitHub release/i);
  assert.match(spanish, /release v0\.9\.4 en GitHub/i);
  assert.match(english, /final v0\.9\.4 release assets are staged under\s+`apps\/shell\/release-0\.9\.4-final-20261016\/`/i);
  assert.match(spanish, /artefactos finales de v0\.9\.4 quedan en\s+`apps\/shell\/release-0\.9\.4-final-20261016\/`/i);
  assert.match(english, /portable Windows executable \(~178\.4 MB/i);
  assert.match(spanish, /ejecutable portable de Windows \(~178,4 MB/i);
  for (const document of [english, spanish]) {
    assert.match(document, /alpha8/);
    assert.match(document, /published|publicada/i);
    assert.match(document, /V094-21/);
    assert.match(document, /V094-35/i);
  }
});

test('release guides and known-issues ledger identify published v0.9.4 as the supported baseline', () => {
  const englishRelease = read('docs/RELEASE.md');
  const spanishRelease = read('docs/RELEASE.es.md');
  const knownIssues = read('docs/KNOWN-ISSUES.md');
  const roadmap = read('docs/ROADMAP.md');
  const translations = read('TODO-spanish-translations.md');

  assert.match(englishRelease, /published v0\.9\.4 release is the current Windows x64 baseline/i);
  assert.doesNotMatch(englishRelease, /v0\.9\.4 is unpublished|unpublished candidate/i);
  assert.doesNotMatch(spanishRelease, /v0\.9\.4 sigue sin publicarse/i);
  assert.match(englishRelease, /release-0\.9\.4-final-20261016/);
  assert.match(spanishRelease, /release-0\.9\.4-final-20261016/);
  assert.match(englishRelease, /portable executable \(~178\.4 MB/i);
  assert.match(spanishRelease, /portable v0\.9\.4 \(~178,4 MB/i);
  assert.match(spanishRelease, /release publicada v0\.9\.4 es la baseline actual para Windows x64/i);
  assert.match(englishRelease, /alpha6\/alpha7 desktop artifacts are superseded|alpha6 desktop artifacts predate V094-35/i);
  assert.match(spanishRelease, /artefactos desktop alpha6\/alpha7 están obsoletos|artefactos desktop alpha6 son anteriores a V094-35/i);
  assert.match(read('release-notes-v0.9.4.md'), /matching alpha5 runtime had been locally precached/i);
  assert.match(englishRelease, /v0\.9\.4 also prevents older DSH runtimes/i);
  assert.match(spanishRelease, /v0\.9\.4 también evita que runtimes\s+DSH/i);
  assert.match(knownIssues, /Última release publicada.*Latest published release: `v0\.9\.4`/is);
  assert.match(knownIssues, /v0\.9\.4 supports Windows x64 only/i);
  assert.match(knownIssues, /v0\.9\.4 sólo se soporta Windows x64/i);
  assert.match(knownIssues, /KI-009.*resolved in v0\.9\.3/is);
  assert.match(knownIssues, /KI-009.*resuelto en v0\.9\.3/is);
  assert.match(knownIssues, /KI-010.*resolved in v0\.9\.4.*published DSH alpha8 runtime asset/is);
  assert.match(knownIssues, /KI-010.*resuelto en v0\.9\.4.*runtime DSH alpha8/is);
  assert.match(knownIssues, /KI-011.*pool-status window.*close button.*deferred to v0\.9\.5/is);
  assert.match(knownIssues, /KI-011.*botón de cierre de estado del pool.*v0\.9\.5/is);
  assert.match(knownIssues, /KI-009.*semantic.*tail/is);
  assert.match(knownIssues, /sufijo semántico puede ocultar historial válido/i);
  assert.match(knownIssues, /preserva los bytes originales raw\/Zstandard/i);
  assert.match(knownIssues, /portable[^\n]*178 MB/i);
  assert.match(knownIssues, /setup\/portable v0\.9\.4 pesan cerca de 178 MB/i);
  assert.match(roadmap, /^Baseline: `v0\.9\.4`$/m);
  assert.match(roadmap, /^Published baseline: `v0\.9\.4`$/m);
  assert.match(roadmap, /^### `v0\.9\.5`.*pool-status.*close/im);
  assert.match(roadmap, /^### `v0\.9\.3`/m);
  assert.match(translations, /baseline publicada v0\.9\.4/i);

  const freshOutputDir = 'release-0.9.4-final-20261016';
  for (const document of [englishRelease, spanishRelease, read('README.md'), read('README.es.md'), read('docs/RELEASE-POLICY.md'), read('docs/RELEASE-POLICY.es.md')]) {
    assert.ok(document.includes(freshOutputDir), `expected ${freshOutputDir} in the active release docs`);
  }
});

test('bilingual v0.9.4 docs mark old assets superseded and record the verified public build', () => {
  const readmeEn = read('README.md');
  const readmeEs = read('README.es.md');
  const releaseEn = read('docs/RELEASE.md');
  const releaseEs = read('docs/RELEASE.es.md');
  const policyEn = read('docs/RELEASE-POLICY.md');
  const policyEs = read('docs/RELEASE-POLICY.es.md');
  const roadmap = read('docs/ROADMAP.md');
  const outputDir = 'apps/shell/release-0.9.4-final-20261016/';
  const setupSha = '3117054ba2ee29c6c9993e7f7cdd525262f8d39e4f037e037c411142659d8a08';
  const portableSha = '79e03080494efcd9fc9f06311b1b4f78238e57b97fd2ea00ba97baa5513f520b';

  assert.match(readmeEn, /alpha6\/alpha7 desktop artifacts are superseded/i);
  assert.match(readmeEs, /artefactos desktop alpha6\/alpha7 están obsoletos/i);
  assert.match(readmeEn, /complete release gate passed[\s\S]{0,180}setup\/portable artifacts were built and statically verified/i);
  assert.match(readmeEs, /El gate completo no interactivo pasó[\s\S]{0,180}setup\/portable se compilaron y verificaron/i);
  for (const document of [readmeEn, readmeEs, releaseEn, releaseEs, policyEn, policyEs]) {
    assert.ok(document.includes(outputDir), `expected ${outputDir} in active release docs`);
  }
  const history = read('release-notes-v0.9.4.md');
  assert.ok(history.includes(setupSha), 'historical candidate notes must retain the old setup digest');
  assert.ok(history.includes(portableSha), 'historical candidate notes must retain the old portable digest');
  assert.match(history, /Setup 0\.9\.4 \| 178,750,879 bytes \| `1e48c6c866a7b52d422eb62b852ffece4b6c5435aa3bbd490960e28395463440`/i);
  assert.match(history, /Portable 0\.9\.4 \| 178,375,755 bytes \| `91f720be4c140477d4d8b9d62b2cc2ba4a0fe97858d7551b38de60b7a2e3cba6`/i);
  assert.match(history, /Setup 0\.9\.4 \| 178,757,839 bytes \| `35b4f5eed71911c8048e32d60e64446701de907bb6c581a3c22d1f7e64371f66`/i);
  assert.match(history, /Portable 0\.9\.4 \| 178,382,701 bytes \| `c549b4e273c748980af632c14bacaeb45bd9d4877e7b839f610fe6cd74e20193`/i);
  assert.match(history, /DSH 0\.2\.1-alpha\.8 runtime \| 421,507,898 bytes \| `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6`/i);
  for (const document of [releaseEn, releaseEs]) assert.match(document, /first launch.*download.*DSH runtime|primer inicio.*descarga.*runtime DSH/is);
  assert.match(policyEn, /v0\.9\.4 published release/i);
  assert.match(policyEs, /release v0\.9\.4 publicada/i);
  assert.match(roadmap, /final non-interactive release gate passed[\s\S]{0,100}setup and portable were built/i);
  assert.match(roadmap, /earlier alpha5[–-]alpha8 desktop builds remain superseded history/i);
  assert.match(roadmap, /(?:The public v0\.9\.4 release|v0\.9\.4 is now the published|v0\.9\.4 is the latest published)/i);
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
  assert.match(policyEn, /v0\.9\.4 published release/i);
  assert.match(policyEs, /release v0\.9\.4 publicada/i);
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
    assert.match(readme, /apps\/shell\/release-0\.9\.4-final-20261016/);
  }
  for (const releaseGuide of [releaseEn, releaseEs]) {
    assert.match(releaseGuide, /package:runtime:release/);
    assert.match(releaseGuide, /release:gate/);
    assert.match(releaseGuide, /release-0\.9\.4-final-20261016/);
  }
  assert.match(releaseEn, /disposable/i);
  assert.match(releaseEs, /desechable/i);

  const staleEnBuild = releaseEn.split('## Local Windows build')[1]?.split('## Runtime dependency policy')[0] ?? '';
  const staleEsBuild = releaseEs.match(/## Build local de Windows([\s\S]*?)## Pol.tica de dependencias runtime/)?.[1] ?? '';
  assert.doesNotMatch(staleEnBuild, /pnpm --filter @freecode\/shell package:runtime/);
  assert.doesNotMatch(staleEsBuild, /pnpm --filter @freecode\/shell package:runtime/);
});

test('current release docs define the hidden test-child boundary consistently', () => {
  const policyEn = read('docs/RELEASE-POLICY.md');
  const policyEs = read('docs/RELEASE-POLICY.es.md');
  const releaseEn = read('docs/RELEASE.md');
  const releaseEs = read('docs/RELEASE.es.md');
  const readmeEn = read('README.md');
  const readmeEs = read('README.es.md');
  const contracts = read('docs/CONTRACT-TESTS.md');

  for (const document of [policyEn, releaseEn, readmeEn]) {
    assert.match(document, /test-owned hidden.*(?:DSH CLI|Electron.*Node)|hidden.*test-owned.*(?:DSH CLI|Electron.*Node)/is);
    assert.match(document, /scratch/i);
    assert.match(document, /does not\s+install or launch the FreeCode GUI/i);
  }
  for (const document of [policyEs, releaseEs, readmeEs]) {
    assert.match(document, /hijos.*(?:headless|ocultos).*propios.*(?:test|prueba)|(?:test|prueba).*propios.*hijos.*(?:headless|ocultos)/is);
    assert.match(document, /scratch|temporal/i);
    assert.match(document, /no instala ni inicia la\s+GUI de FreeCode/i);
  }
  assert.match(policyEn, /does not\s+enumerate or kill unrelated processes/i);
  assert.match(policyEs, /no enumera ni termina\s+procesos ajenos/i);
  assert.match(contracts, /statically verifies the NSIS package/i);
  assert.doesNotMatch(contracts, /release gate installs the candidate into a clean isolated directory/i);
});
