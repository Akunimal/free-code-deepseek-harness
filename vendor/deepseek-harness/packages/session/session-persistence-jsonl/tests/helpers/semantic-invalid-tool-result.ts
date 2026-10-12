import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** A valid tool exchange prefix followed by a first-class result with mismatched correlation. */
export function semanticInvalidToolResultTail(toolCallId = '', sourceCallId = 'call-1'): SessionEvent[] {
  const rows = [
    { type: 'turn/start', data: { turn: 1 } },
    {
      type: 'user/message',
      data: { id: 'input', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'input' }] },
      surfaceOp: 'append',
    },
    { type: 'step/start', data: { turn: 1, step: 1 } },
    {
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        stream: [],
        message: {
          id: 'assistant',
          role: 'assistant',
          source: { kind: 'model', provider: 'mock', model: 'mock' },
          content: [{ type: 'tool-call', id: 'call-1', name: 'read', arguments: '{}' }],
        },
      },
      surfaceOp: 'append',
    },
    { type: 'tool/call', data: { turn: 1, step: 1, callId: 'call-1', name: 'read', arguments: '{}' } },
    {
      type: 'tool/result',
      data: {
        turn: 1,
        step: 1,
        message: {
          id: 'result',
          role: 'tool',
          source: { kind: 'tool', callId: sourceCallId },
          toolCallId,
          content: [{ type: 'text', text: 'done' }],
        },
      },
      surfaceOp: 'append',
    },
    { type: 'step/end', data: { turn: 1, step: 1 } },
  ]
  return rows.map((row, seq) => ({ ...row, seq: SessionSeq(seq), time: seq + 1 })) as unknown as SessionEvent[]
}
