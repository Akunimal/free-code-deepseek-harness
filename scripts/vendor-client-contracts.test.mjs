import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../vendor/deepseek-harness');
const require = createRequire(resolve(root, 'package.json'));
const ts = require('typescript');
const locale = resolve(root, 'packages/client/locale/src');

function diagnose(file, text) {
  const options = {
    strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
    skipLibCheck: true, noEmit: true, types: [],
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options);
  const get = host.getSourceFile.bind(host);
  if (text !== undefined) {
    const fileExists = host.fileExists.bind(host);
    host.fileExists = name => resolve(name) === resolve(file) || fileExists(name);
    host.getSourceFile = (name, version, ...args) => resolve(name) === resolve(file)
      ? ts.createSourceFile(name, text, version, true) : get(name, version, ...args);
  }
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
}

function registerContract(calls) {
  const source = ts.createSourceFile('locale.ts', readFileSync(resolve(locale, 'client/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const klass = source.statements.find(ts.isClassDeclaration);
  const overload = klass.members.find(member => member.name?.getText(source) === 'register' && member.typeParameters?.length);
  return `type BuiltInLocaleId='en'|'zh'|'es';
type LocaleNamespaceMap={fixture:'label'};
type LocaleDictOf<N extends keyof LocaleNamespaceMap>=Record<LocaleNamespaceMap[N],string>;
declare class Registry { ${overload.getText(source)} }
declare const registry:Registry;
${calls}`;
}

test('the actual locale overload permits an English/Chinese plugin with Spanish fallback', () => {
  const diagnostics = diagnose(resolve(root, '__locale_contract__.ts'), registerContract(
    `registry.register('fixture',{en:{label:'Label'},zh:{label:'标签'}});`,
  ));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: name => name, getNewLine: () => '\n',
  }));
});

test('provided locale dictionaries still require valid complete namespace keys', () => {
  for (const call of [
    `registry.register('fixture',{en:{},zh:{label:'标签'}});`,
    `registry.register('fixture',{en:{label:'Label'},zh:{label:'标签'},es:{wrong:'No'}});`,
  ]) assert.ok(diagnose(resolve(root, '__locale_contract__.ts'), registerContract(call)).length > 0);
});

test('Spanish common keys exactly match the canonical vocabulary', () => {
  const keys = language => {
    const source = ts.createSourceFile(language + '.ts', readFileSync(resolve(locale, 'locales', language + '.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
    const result = [];
    function visit(node) {
      if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) result.push(node.name.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    return result.sort();
  };
  assert.deepEqual(keys('es'), keys('zh'));
});

test('Hermes production patterns compile with the vendor strict indexed-access policy', () => {
  const diagnostics = diagnose(resolve(root, 'packages/client/ui-conversation/src/client/skeleton/phoenixPatterns.ts'));
  assert.equal(diagnostics.length, 0, diagnostics.map(d => `${d.start}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`).join('\n'));
});

test('Client fixtures do not import the Host Session service or Host preset entry', () => {
  for (const file of [
    'packages/api/session-controller/tests/assistant-stream.client.spec.ts',
    'packages/client/ui-user-questions/tests/question-reply.client.spec.ts',
    'packages/client/ui-agent-preset/tests/apply.client.spec.ts',
    'packages/client/ui-tool/tests/spill-policy-terminal.client.spec.ts',
  ]) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(source, /from ['"]@deepseek-ai\/dsh-session['"]/, file);
    assert.doesNotMatch(source, /import.*hostApply.*from ['"]\.\.\/src\/index\.ts['"]/, file);
  }
});

test('the shared producer fixture belongs to the Host compiler, never the Client compiler', () => {
  const fixture = resolve(root, 'packages/client/ui-tool/tests/spill-policy-terminal.host-fixture.ts');
  const files = face => {
    const file = resolve(root, `tsconfig.${face}.json`);
    const config = ts.readConfigFile(file, ts.sys.readFile).config;
    return ts.parseJsonConfigFileContent(config, ts.sys, root).fileNames.map(name => resolve(name));
  };
  assert.ok(files('host').includes(fixture), 'Host must continue typechecking the real producer');
  assert.ok(!files('client').includes(fixture), 'Client must not load Host Context declarations');
});

test('read-only recovery metadata has a Cordis-free Client import', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'packages/session/session-persistence/package.json'), 'utf8'));
  assert.ok(manifest.exports['./recovery'], 'recovery metadata needs its own public leaf');
  for (const file of [
    'packages/api/session-controller/src/types.ts',
    'packages/api/session-controller/src/client/contract/snapshot.ts',
    'packages/api/session-controller/src/client/transport.ts',
    'packages/api/session-controller/src/client/sessions/session.ts',
    'packages/api/session-controller/tests/remote/session.client.ts',
  ]) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.match(source, /from ['"]@deepseek-ai\/dsh-session-persistence\/recovery['"]/, file);
    assert.doesNotMatch(source, /from ['"]@deepseek-ai\/dsh-session-persistence['"]/, file);
  }
  const leaf = readFileSync(resolve(root, 'packages/session/session-persistence/src/recovery.ts'), 'utf8');
  assert.doesNotMatch(leaf, /\b(?:import|export)\s.*\bfrom\b|declare module/);
});

test('details adapters consume real Host-rendered strings across a pure fixture contract', () => {
  const source = readFileSync(resolve(root, 'packages/client/ui-tool/tests/details-models.client.spec.ts'), 'utf8');
  assert.doesNotMatch(source, /from ['"]@deepseek-ai\/dsh-(?:tool-session-query|tool-terminal|tool-jobs|spill)(?:['"/])/);
  assert.match(source, /details-models\.host-fixture\.ts/);
});

test('the Schedule manager has its own complete fallback, not the smaller catalog vocabulary', () => {
  const source = readFileSync(resolve(root, 'packages/client/ui-schedule/src/client/index.ts'), 'utf8');
  assert.match(source, /register\(MANAGER_NS, \{ zh: managerZh, en: managerEn, es: \{ \.\.\.managerEn, \.\.\.es \} \}\)/);
});

test('native tool adapters identify their provider in the shared MCP diagnostic contract', () => {
  for (const [name, server] of [
    ['browser-use-stagehand-native', 'stagehand-native'],
    ['computer-use-cua-driver-native', 'cua-driver-native'],
  ]) {
    const source = readFileSync(resolve(root, `packages/experimental/${name}/src/index.ts`), 'utf8');
    assert.match(source, new RegExp(`serverName: '${server}'`), name);
  }
});
