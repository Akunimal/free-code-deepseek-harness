import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { PartialArguments } from '@deepseek-ai/dsh-util-values'

/** Structural wire value; the Client checks it against its actual card input. */
export interface SpillTerminalBlock {
  kind: 'tool-result'
  seq: number
  time: number
  callTime: number | null
  callId: string
  parentCallId?: string
  name: string
  args: PartialArguments
  call: { name: string; argsRaw: string }
  content: readonly ContentBlock[]
  isError: boolean
  subCalls: readonly never[]
}

/** Pure value boundary shared by independently typechecked Host/Client tests. */
export interface SpillTerminalFixture {
  executeShell(text: string, nested: boolean, name?: string, maxInlineTokens?: number): Promise<{
    block: SpillTerminalBlock
    saves: { input: unknown; bytes: Buffer }[]
  }>
}
