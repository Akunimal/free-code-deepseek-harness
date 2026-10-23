import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

test('root and shell metadata agree on 1.0.2 and keep the DSH alpha12 runtime pin', () => {
  const rootVersion = JSON.parse(read('package.json')).version;
  const shellVersion = JSON.parse(read('apps/shell/package.json')).version;

  assert.equal(rootVersion, '1.0.2');
  assert.equal(shellVersion, rootVersion);
  assert.equal(JSON.parse(read('apps/shell/harness-runtime.json')).version, '0.2.1-alpha.12');
  const phoenix = JSON.parse(read('apps/shell/resources/runtime-deps.json')).dependencies
    .find((dependency) => dependency.id === 'phoenix');
  assert.equal(phoenix?.required, true);
  assert.equal(phoenix?.path, 'phoenix/freellmpool-win-x64.exe');
});

test('v1.0.1 bilingual release notes describe bundled Phoenix and published status', () => {
  const notes = read('release-notes-v1.0.1.md');
  const english = notes.split('## English')[1]?.split('## Español')[0] ?? '';
  const spanish = notes.split('## Español')[1] ?? '';
  assert.match(notes, /^# FreeCode DeepSeek Harness v1\.0\.1/m);
  assert.match(english, /published/i);
  assert.match(spanish, /publicad[ao]|publica/i);
  for (const section of [english, spanish]) {
    assert.match(section, /Phoenix/i);
    assert.match(section, /FreeLLMpool/i);
    assert.match(section, /Auto/i);
    assert.match(section, /strict|estrict/i);
    assert.match(section, /opencode2api/i);
  }
});

test('v1.0.1 bilingual Phoenix notes audit model-native contexts and conservative alias caps', () => {
  const notes = read('release-notes-v1.0.1.md');
  const english = notes.split('## English')[1]?.split('## Español')[0] ?? '';
  const spanish = notes.split('## Español')[1] ?? '';
  for (const [section, language] of [[english, 'English'], [spanish, 'Español']]) {
    assert.match(section, /1[,.]000[,.]000/u, `${language} should record 1M routes`);
    assert.match(section, /512[,.]000/u, `${language} should record the Dots3 context`);
    assert.match(section, /262[,.]144/u, `${language} should record Qwen contexts`);
    assert.match(section, /131[,.]072/u, `${language} should record 128K routes`);
    assert.match(section, /128[,.]000/u, `${language} should distinguish Qwen2.5-VL's exact value`);
    assert.match(section, /32[,.]768/u, `${language} should identify the conservative cap`);
    assert.match(section, /provider|proveedor[ae]s?/iu, `${language} should disclose provider caps`);
    assert.match(section, /native|nativ[oa]/iu, `${language} should distinguish model-native capacity`);
    assert.match(section, /llm7\/default/u, `${language} should name a dynamic alias`);
  }
});

test('v0.9.6 release notes are bilingual and disclose the private-desktop boundary and clean-cache requirement', () => {
  const notes = read('release-notes-v0.9.6.md');
  assert.match(notes, /^## English$/m);
  assert.match(notes, /^## Español$/m);
  for (const part of [notes.split('## English')[1]?.split('## Español')[0], notes.split('## Español')[1]]) {
    assert.match(part, /0\.2\.1-alpha\.9/);
    assert.match(part, /headless-host/);
    assert.match(part, /Job/);
    assert.match(part, /SHA-256/);
    assert.match(part, /(?:clean-cache|caché vacía)/);
    assert.match(part, /(?:unsigned|sin firma)/);
    assert.match(part, /(?:Internet)/);
  }
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
  assert.match(currentEnglish, /\| Setup 0\.9\.4 \| 178,757,839 bytes \| `ec1ee3b2b2ea811f72de3b90ee95d8f0292bc08440aa92956dfea7f01083f2b7` \|/i);
  assert.match(currentEnglish, /\| Portable 0\.9\.4 \| 178,382,701 bytes \| `de3a94b3de80a48cc764bc4a99d1d906a457cd96a6db3d7010ddf9bcf1768f26` \|/i);
  assert.match(currentEnglish, /\| DSH 0\.2\.1-alpha\.8 runtime \+ checksum asset \| 421,507,898 bytes \| `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6` \|/i);
  assert.match(currentSpanish, /\| Setup 0\.9\.4 \| 178\.757\.839 bytes \| `ec1ee3b2b2ea811f72de3b90ee95d8f0292bc08440aa92956dfea7f01083f2b7` \|/i);
  assert.match(currentSpanish, /\| Portable 0\.9\.4 \| 178\.382\.701 bytes \| `de3a94b3de80a48cc764bc4a99d1d906a457cd96a6db3d7010ddf9bcf1768f26` \|/i);
  assert.match(currentSpanish, /\| Runtime DSH 0\.2\.1-alpha\.8 \+ archivo checksum \| 421\.507\.898 bytes \| `bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6` \|/i);
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


const activeDocs = ['README.md', 'README.es.md', 'docs/RELEASE.md', 'docs/RELEASE.es.md',
  'docs/RELEASE-POLICY.md', 'docs/RELEASE-POLICY.es.md', 'docs/ROADMAP.md'];

test('active documentation aligns the Phoenix v1.0.2 release, alpha.12 and containment', () => {
  for (const file of activeDocs) {
    const source = read(file);
    assert.match(source, /v1\.0\.2/, file);
    assert.match(source, /0\.2\.1-alpha\.12/, file);
    assert.match(source, /release-notes-v1\.0\.2\.md/, file);
    assert.match(source, /release-1\.0\.2-final-20261023/, file);
    assert.match(source, /Phoenix/i, file);
    // ROADMAP keeps the historical v0.9.x Tor entries; current docs must not.
    if (file !== 'docs/ROADMAP.md') assert.doesNotMatch(source, /bundled Tor|Tor incluido|tor\.exe/, file);
    assert.match(source, /headless-host/, file);
    assert.match(source, /clean-cache|caché vacía|caché.*vacíos|empty.*cache/i, file);
    assert.doesNotMatch(source, /(?:Current release|Release actual|Current status|Estado actual):[^\n]*v0\.9\.[45]/i, file);
    assert.doesNotMatch(source, /(?:pin remains|pin.*sigue en|pins DSH|fijado en) 0\.2\.1-alpha\.8/i, file);
  }
});

test('architecture, contracts and issue ledger describe Phoenix rather than an active OpenCode2API gateway', () => {
  for (const file of ['docs/ARCHITECTURE.md', 'docs/CONTRACT-TESTS.md', 'docs/KNOWN-ISSUES.md']) {
    const source = read(file);
    assert.match(source, /Phoenix/i, file);
    assert.match(source, /FreeLLMpool/i, file);
    assert.doesNotMatch(source, /(?:active|current|single|bundled|included)[^\n]{0,80}opencode2api|opencode2api[^\n]{0,80}(?:active|current|single|bundled|included)/i, file);
  }
  const architecture = read('docs/ARCHITECTURE.md');
  assert.match(architecture, /Auto[\s\S]{0,160}(?:strict|pin)|(?:strict|pin)[\s\S]{0,160}Auto/i);
  assert.match(architecture, /freecode-launcher/);
  const contracts = read('docs/CONTRACT-TESTS.md');
  assert.match(contracts, /concrete[\s\S]{0,80}pin|pin[\s\S]{0,80}concrete/i);
  assert.match(contracts, /Auto[\s\S]{0,160}(?:pre-stream|before streaming)/i);
  assert.match(contracts, /v1\.0\.2/);
});

test('READMEs agree on Phoenix gateway, version, support and first-run network', () => {
  const en = read('README.md');
  const es = read('README.es.md');
  assert.match(en, /Source version: 1\.0\.2/);
  assert.match(es, /Versión de la fuente: 1\.0\.2/);
  assert.match(en, /Windows x64 only/i);
  assert.match(es, /solo Windows x64/i);
  for (const doc of [en, es]) {
    assert.match(doc, /Internet/);
    assert.match(doc, /Hermes/);
    assert.match(doc, /FreeLLMpool/);
    assert.match(doc, /Auto Phoenix/);
    assert.match(doc, /strict|estrict/i);
    assert.match(doc, /pnpm release:gate/);
    assert.match(doc, /pnpm verify:desktop-release-assets/);
    assert.match(doc, /v1\.0\.0[\s\S]{0,80}histor|histor[\s\S]{0,80}v1\.0\.0/i);
    assert.match(doc, /runtime-0\.2\.1-alpha\.12/);
    assert.match(doc, /release|versión|version/i);
    assert.doesNotMatch(doc, /current[^\n]*opencode2api gateway|gateway opencode2api incluido/i);
    assert.doesNotMatch(doc, /start hidden, preventing console flashes|arrancan ocultos: no flashean/);
  }
});

test('permanent coder rules and EN/ES policy retain real public first-install proof', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /public clean-cache runtime smoke/);
  assert.match(agents, /preloaded runtime cache/);
  assert.match(agents, /static hashes/);
  assert.match(agents, /hold publication|hold the release/);
  assert.match(agents, /suspended-process Job attachment/);
  assert.match(agents, /adversarial native window/);
  const contracts = read('docs/CONTRACT-TESTS.md');
  assert.match(contracts, /genuinely empty scratch profile\/cache/);
  assert.match(contracts, /static hashes, mocks, a preloaded\s+cache/i);
  for (const file of ['docs/RELEASE-POLICY.md', 'docs/RELEASE-POLICY.es.md']) {
    const doc = read(file);
    assert.match(doc, /first-run-runtime-download/);
    assert.match(doc, /GitHub/);
    assert.match(doc, /SHA-256/);
    assert.match(doc, /ABI/);
    assert.match(doc, /package:runtime:release/);
    assert.match(doc, /headless-host/);
    assert.match(doc, /Job/);
    assert.match(doc, /disposable|desechable/);
    assert.match(doc, /RELEASE-POLICY(?:\.es)?\.md/);
  }
});

test('v0.9.5 release notes and older desktop/runtime hashes remain immutable history', () => {
  const notes = read('release-notes-v0.9.5.md');
  assert.match(notes, /v0\.9\.5.*Published/);
  assert.match(notes, /Pool Status window[\s\S]*preload IPC/);
  assert.match(notes, /cierre[\s\S]*Estado del pool/);
  for (const hash of ['a3a20d775b72499b994d9f89458f710a12ee44fc9118738a90ee9d5f8ba13406',
    '77b279db79d1560dfdbc97bfb8360832a93ce97de06f9570829350333e826bec']) assert.ok(notes.includes(hash));
  const history = read('release-notes-v0.9.4.md');
  for (const hash of ['3117054ba2ee29c6c9993e7f7cdd525262f8d39e4f037e037c411142659d8a08',
    '79e03080494efcd9fc9f06311b1b4f78238e57b97fd2ea00ba97baa5513f520b',
    'bf9f4324f0a10d6ff0861e365284d08d8f3745a3c5da49621d339629926023a6']) assert.ok(history.includes(hash));
  assert.match(history, /V094-21[\s\S]*seed the\s+live provider catalog before starting DSH/i);
  assert.match(history, /Muse Spark[\s\S]{0,120}16-token output budget/);
  assert.match(history, /do not cool Direct\/Tor[\s\S]{0,100}HTTP 400\/401\/403/);
});

test('changelog and issue ledger distinguish 0.9.6 fixes from earlier releases and limits', () => {
  const changelog = read('CHANGELOG.md');
  for (const version of ['0.9.6', '0.9.5', '0.9.4', '0.9.3']) assert.ok(changelog.includes('## ' + version));
  assert.ok(changelog.indexOf('## 0.9.6') < changelog.indexOf('## 0.9.5'));
  assert.match(changelog, /release-notes-v0\.9\.6\.md/);
  assert.match(changelog, /0\.2\.1-alpha\.9/);
  assert.match(changelog, /Job/);
  const issues = read('docs/KNOWN-ISSUES.md');
  assert.match(issues, /KI-012[\s\S]*v0\.9\.6/);
  assert.match(issues, /KI-011[\s\S]*Resolved in v0\.9\.5/);
  assert.match(issues, /KI-010[\s\S]*resolved in v0\.9\.4/i);
  assert.match(issues, /KI-009[\s\S]*resolved in v0\.9\.3/i);
  assert.match(issues, /0\.2\.1-alpha\.9/);
  assert.match(issues, /Windows x64 only/);
  assert.match(issues, /sólo se soporta Windows x64/);
  assert.match(read('docs/historial/TODO-spanish-translations.md'), /baseline.*v1\.0\.1/);
});

test('release guides keep isolated hidden children, static desktop checks and no workstation installer smoke', () => {
  const en = read('docs/RELEASE.md');
  const es = read('docs/RELEASE.es.md');
  const policyEn = read('docs/RELEASE-POLICY.md');
  const policyEs = read('docs/RELEASE-POLICY.es.md');
  for (const doc of [en, policyEn]) {
    assert.match(doc, /test-owned hidden.*(?:DSH CLI|Electron.*Node)|hidden.*test-owned.*(?:DSH CLI|Electron.*Node)/is);
    assert.match(doc, /scratch/i);
    assert.match(doc, /does not[\s\S]{0,40}install[\s\S]{0,40}launch/i);
    assert.match(doc, /disposable/);
  }
  for (const doc of [es, policyEs]) {
    assert.match(doc, /hijos.*(?:headless|ocultos).*propios.*(?:test|prueba)|(?:test|prueba).*propios.*hijos.*(?:headless|ocultos)/is);
    assert.match(doc, /scratch|temporal/);
    assert.match(doc, /no instala ni inicia la\s+GUI de\s+FreeCode/i);
    assert.match(doc, /desechable/);
  }
  assert.match(policyEn, /does not\s+enumerate or kill unrelated processes/);
  assert.match(policyEs, /no enumera ni termina\s+procesos ajenos/);
  assert.match(read('docs/CONTRACT-TESTS.md'), /statically verifies the NSIS package/);
});
