/** Producer-to-UI regression: Host and Client have separate typed Contexts. */
import { describe, expect, it } from 'vitest'
import { estimateContent } from '@deepseek-ai/dsh-token-meter/estimate'
import { SpillLocator } from '../../../spill/spill/src/types.ts'
import { formatSpillNotice } from '@deepseek-ai/dsh-spill-policy/notice'
import type { SpillTerminalFixture } from './spill-policy-terminal.contract.ts'
import { isSpilledShellCall, terminalCardModel } from '../src/client/tool/models/terminal-card-model.ts'

const spillReference = { locator: SpillLocator('/spill/shell.txt'), retrievalHint: 'Read the saved text.' }
// The producer is independently checked by the Host aggregate. Runtime import
// keeps its Host Context merge out of this Client program; the shared structural
// contract is checked by both sides (no untyped fixture results).
const producerModule = './spill-policy-terminal.host-fixture.ts'
const producer = import(producerModule) as Promise<SpillTerminalFixture>
const executeShell: SpillTerminalFixture['executeShell'] = async (...args) =>
  (await producer).executeShell(...args)

describe.each([
  { location: 'root', nested: false },
  { location: 'nested', nested: true },
])('$location spill-policy shell terminal fallback', ({ nested }) => {
  describe.each(['bash', 'pwsh'])('%s', (name) => {
    it.each([
      { outcome: 'nonzero exit', marker: '\n[exit code: 7]' },
      { outcome: 'terminating signal', marker: '\n[killed by signal: SIGTERM]' },
      { outcome: 'markerless output', marker: '' },
    ])('keeps a spilled $outcome result generic', async ({ marker }) => {
      const original = 'HEAD 雪\n'.repeat(200) + marker
      const { block, saves } = await executeShell(original, nested, name)
      expect(saves).toHaveLength(1)
      expect(saves[0]!.input).toMatchObject({
        owner: { sessionId: 'spill-terminal' },
        source: { toolName: name, callId: block.callId, label: nested ? 'dispatch' : 'result' },
        content: original,
      })
      expect(saves[0]!.bytes).toEqual(Buffer.from(original, 'utf8'))
      expect(block.content).not.toEqual([{ type: 'text', text: original }])
      expect(block.content).toHaveLength(1)
      const preview = block.content[0]!
      if (preview.type !== 'text') throw new Error('expected a plain-text spill preview')
      expect(estimateContent(block.content)).toBeLessThanOrEqual(256)
      expect(preview.text).toContain('HEAD')
      if (marker !== '') expect(preview.text).toContain(marker)
      expect(terminalCardModel(block)).toBeNull()
      expect(isSpilledShellCall(block)).toBe(true)
    })

    it('keeps a notice-only result generic when no preview fits', async () => {
      const original = '雪'.repeat(1_000) + '\n[exit code: 9]'
      const notice = formatSpillNotice({ kind: 'exact', count: Buffer.byteLength(original, 'utf8') }, spillReference)
      const { block, saves } = await executeShell(original, nested, name, estimateContent([{ type: 'text', text: notice }]))
      expect(block.content).toEqual([{ type: 'text', text: notice }])
      expect(saves).toHaveLength(1)
      expect(saves[0]!.bytes).toEqual(Buffer.from(original, 'utf8'))
      expect(terminalCardModel(block)).toBeNull()
      expect(isSpilledShellCall(block)).toBe(true)
    })

    it('retains a terminal card when the result fits without spilling', async () => {
      const original = 'short output\n[exit code: 7]'
      const { block, saves } = await executeShell(original, nested, name)
      expect(saves).toHaveLength(0)
      expect(block.content).toEqual([{ type: 'text', text: original }])
      expect(terminalCardModel(block)?.card).toMatchObject({ output: 'short output', exitCode: 7 })
      expect(isSpilledShellCall(block)).toBe(false)
    })
  })
})
