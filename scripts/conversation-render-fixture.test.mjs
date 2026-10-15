import assert from 'node:assert/strict';
import test from 'node:test';
import { emittedRegion } from './conversation-render-fixture.mjs';

test('production region extraction accepts source and tsc-emitted entry pipelines unchanged', () => {
  for (const file of ['src/client/skeleton/ConversationMainPanel.tsx', 'lib/types/client/skeleton/ConversationMainPanel.js']) {
    const body = '\nfunction ConversationMainPanel(){return realProductionBody}\n';
    assert.equal(emittedRegion(`//#region ${file}${body}//#endregion`, 'skeleton/ConversationMainPanel.tsx'), body);
  }
});

test('production extraction refuses missing, ambiguous, or unterminated regions', () => {
  assert.throws(() => emittedRegion('//#region other/MainPanel.js\n//#endregion', 'skeleton/ConversationMainPanel.tsx'), /missing/);
  assert.throws(() => emittedRegion('//#region skeleton/ConversationMainPanel.js\n', 'skeleton/ConversationMainPanel.tsx'), /incomplete/);
  assert.throws(() => emittedRegion('//#region skeleton/ConversationMainPanel.js\n//#endregion\n//#region skeleton/ConversationMainPanel.tsx\n//#endregion', 'skeleton/ConversationMainPanel.tsx'), /ambiguous/);
});
