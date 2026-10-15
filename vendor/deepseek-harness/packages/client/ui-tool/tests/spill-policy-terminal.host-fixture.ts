/** Host-only producer, typechecked separately from Client Context services. */
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SpillTerminalBlock, SpillTerminalFixture } from './spill-policy-terminal.contract.ts'
import { PtcRuntime } from '@deepseek-ai/dsh-ptc-runtime'
import type { PtcRunRequest, PtcRunSpec, PtcRunResult } from '@deepseek-ai/dsh-ptc-runtime'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SpillLocator, SpillStore, type SaveTextSpill, type SpillRef } from '@deepseek-ai/dsh-spill'
import * as SpillPolicy from '@deepseek-ai/dsh-spill-policy'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { expect } from 'vitest'

const spillReference = {
  locator: SpillLocator('/spill/shell.txt'),
  retrievalHint: 'Read the saved text.',
}

class MemorySpillStore extends SpillStore {
  readonly saves: { input: SaveTextSpill; bytes: Buffer }[] = []

  async saveText(input: SaveTextSpill): Promise<SpillRef> {
    const bytes = Buffer.from(input.content, 'utf8')
    this.saves.push({ input, bytes })
    return {
      ...spillReference,
      bytes: bytes.length,
    }
  }
}

const shellArgs = { command: 'fixture-output', description: 'Return shell output fixture' }

export const executeShell: SpillTerminalFixture['executeShell'] = async (text, nested, name = 'bash', maxInlineTokens = 256) => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'both' })
    await ctx.plugin(MemorySpillStore)
    await ctx.plugin(SpillPolicy, { maxInlineTokens })
    if (nested) {
      // The real registry and spill policy own nested output; evaluator execution has its own process suite.
      class BindingRuntime extends PtcRuntime {
        readonly language = 'typescript'
        readonly isolation = 'fixture'
        resolve(request: PtcRunRequest): PtcRunSpec {
          return { ...request, cwd: process.cwd(), timeoutMs: 120_000 }
        }
        async run(spec: PtcRunSpec): Promise<PtcRunResult> {
          const tool = spec.bindings.find(binding => binding.global === 'tools')?.functions[name]
          if (tool === undefined) throw new Error('missing fixture binding')
          const blocks = await tool(shellArgs)
          expect(blocks).toEqual([{ type: 'text', text }])
          return { logs: [], value: true }
        }
      }
      await ctx.plugin(BindingRuntime)
    }
    ctx.effect(() => ctx.tools.register(defineContentToolFixture({
      name,
      description: 'Return deterministic shell text without spawning a process.',
      parameters: {
        command: { type: 'string', required: true },
        description: { type: 'string', required: true },
      },
      async execute() { return [{ type: 'text', text }] },
    })))
    const session = Session.create(SessionId('spill-terminal'))
    // The tool pipeline reads only the owner session; no agent loop runs here.
    const agent = { session } as Agent
    const callId = ToolCallId('shell-call')
    const result = await ctx.tools.execute({
      callId,
      agent,
      signal: new AbortController().signal,
      name: nested ? 'run_code' : name,
      arguments: nested ? {
        code: `const blocks = await tools.${name}(${JSON.stringify(shellArgs)}); return blocks[0].text === ${JSON.stringify(text)};`,
        description: 'Dispatch shell fixture through the tool pipeline',
      } : shellArgs,
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('shell fixture execution failed')

    let block: SpillTerminalBlock
    if (nested) {
      expect(result.value).toMatchObject({ result: true })
      const dispatches = session.snapshotEvents().filter(event => event.type === 'tool/ptc-dispatch')
      expect(dispatches).toHaveLength(1)
      const event = dispatches[0]!
      block = {
        kind: 'tool-result', seq: event.seq, time: event.time, callTime: null,
        callId: event.data.subCallId, parentCallId: event.data.parentCallId,
        name: event.data.name, args: PartialArguments.fromText(JSON.stringify(event.data.arguments)),
        call: { name: event.data.name, argsRaw: JSON.stringify(event.data.arguments) },
        content: event.data.content, isError: event.data.isError, subCalls: [],
      }
    } else {
      expect(result.value).toEqual([{ type: 'text', text }])
      block = {
        kind: 'tool-result', seq: 1, time: 1, callTime: null, callId,
        name, args: PartialArguments.fromText(JSON.stringify(shellArgs)),
        call: { name, argsRaw: JSON.stringify(shellArgs) },
        content: result.content, isError: result.isError, subCalls: [],
      }
    }
    expect(block.isError).toBe(false)
    const saves = (ctx.spillStore as MemorySpillStore).saves
    return { block, saves }
  } finally {
    await ctx.fiber.dispose()
  }
}

