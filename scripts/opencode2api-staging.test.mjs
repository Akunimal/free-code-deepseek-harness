import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { stageSidecar, verifyStagedSidecar } from './opencode2api-staging.mjs';

test('packaging rejects stale sidecar bytes, source fingerprint and missing build receipt', () => {
  const root = mkdtempSync(join(tmpdir(), 'freecode-sidecar-stage-'));
  try {
    for (const path of ['vendor/opencode2api/internal', 'apps/shell/resources/opencode2api', 'patches']) mkdirSync(join(root,path),{recursive:true});
    writeFileSync(join(root,'vendor/opencode2api/UPSTREAM_VERSION'),'v1.3.8\n');
    writeFileSync(join(root,'vendor/opencode2api/internal/fixture.go'),'package fixture\n');
    const source=join(root,'apps/shell/resources/opencode2api/opencode2api-win-x64.exe');
    writeFileSync(source,'built test fixture');
    assert.throws(()=>verifyStagedSidecar(root),/receipt|ENOENT/);
    stageSidecar(root);
    assert.equal(verifyStagedSidecar(root),true);
    const staged=join(root,'apps/shell/resources/freecode/opencode2api/opencode2api-win-x64.exe');
    writeFileSync(staged,'stale binary');
    assert.throws(()=>verifyStagedSidecar(root),/stale/);
    stageSidecar(root);
    writeFileSync(join(root,'vendor/opencode2api/internal/fixture.go'),'package changed\n');
    assert.throws(()=>verifyStagedSidecar(root),/source/);
    assert.equal(readFileSync(source,'utf8'),'built test fixture');
  } finally {rmSync(root,{recursive:true,force:true});}
});
