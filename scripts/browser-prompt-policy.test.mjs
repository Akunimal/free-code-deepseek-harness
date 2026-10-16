import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('browser-first system policy belongs to the replayable runtime patch stack', () => {
  const manifest=JSON.parse(readFileSync(new URL('../patches/upstream/upstream-patches.json',import.meta.url),'utf8'));
  const entry=manifest.patches.find(p=>p.file==='169-freecode-browser-first-policy.patch');
  assert.ok(entry,'browser-first overlay must be registered, not a direct vendor edit');
  assert.deepEqual(entry.contractTests,['packages/web/tool-web/tests/browser-policy.spec.ts']);
  assert.equal(entry.vendorOnly,true);
});

test('the current runtime retains browser-first policy without reusing a stale immutable asset', () => {
  const pin=JSON.parse(readFileSync(new URL('../apps/shell/harness-runtime.json',import.meta.url),'utf8'));
  assert.equal(pin.version,'0.2.1-alpha.7');
  const notes=readFileSync(new URL('../release-notes-v0.9.4.md',import.meta.url),'utf8');
  assert.match(notes,/browser-first/i);
  assert.match(notes,/navegador.*primero/i);
  assert.match(notes,/0\.2\.1-alpha\.4/);
});

test('public docs do not contradict the shipped embedded-browser-first research policy', () => {
  for (const file of ['README.md', 'README.es.md', 'docs/mcp-servers.md']) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /default HTTP-first|ruta HTTP-first para\s+investigar|browser is opened only when|navegador embebido sólo se/i);
    assert.match(source, /browser-first|navegador embebido primero/i);
  }
});
