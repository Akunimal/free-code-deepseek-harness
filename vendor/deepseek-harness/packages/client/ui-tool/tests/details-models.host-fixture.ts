/** Real Host formatters; independently typechecked by the Host aggregate. */
import { statusLine } from '@deepseek-ai/dsh-tool-jobs/src/render.ts'
import { presentation } from '@deepseek-ai/dsh-tool-session-query/src/presentation.ts'
import { renderList, renderRead, renderSpawn } from '@deepseek-ai/dsh-tool-terminal/src/render.ts'
import type { DetailsProducerFixture } from './details-models.contract.ts'

export const produceDetails: DetailsProducerFixture['produceDetails'] = () => {
  const terminals = [
    { sessionId: 'pty-1' as never, type: 'shell', status: { kind: 'running' as const } },
    { sessionId: 'pty-2' as never, name: 'done', type: 'shell', pid: 4, status: { kind: 'exited' as const, exitCode: 2, signal: null } },
  ]
  const sessionRecord = (id: string, live: boolean, persisted: boolean) => ({
    header: { id: id as never, createdAt: 1_000, parentSession: undefined }, live, persisted,
  })
  const session = sessionRecord('s1', true, true)
  const hit = { ...session, bestMatch: { sessionId: 's1' as never, seq: 2, type: 'user/message', time: 2_000, surface: 'current', snippet: 'needle' } }
  const title = { text: 'Session one' }
  const titles = new Map([
    ['s1' as never, title], ['s2' as never, { text: 'Child' }], ['s3' as never, { text: 'Grandchild' }],
  ]) as Parameters<typeof presentation.formatSessionSearch>[1]
  const event = { seq: 2, time: 2_000, type: 'tool/call', data: { name: 'x' } }
  return {
    terminalsEmpty: renderList([], 1000),
    terminals: renderList(terminals, 1000),
    spawn: renderSpawn({ sessionId: 'pty-1', type: 'shell', status: { kind: 'running' }, motd: 'ready' }, 1000),
    read: renderRead({ text: 'line', totalLines: 2, lineBegin: 0, lineEnd: 1, truncated: true }, 1000),
    jobCompleted: statusLine({ status: 'completed' }),
    jobExit: statusLine({ status: 'completed', detail: 'exit code: 0' }),
    sessionSearch: presentation.formatSessionSearch({ items: [hit as never], capped: true }, titles, new Set()),
    eventSearch: presentation.formatEventSearch('s1' as never, title, {
      items: [{ sessionId: 's1' as never, seq: 2 as never, type: 'tool/call', time: 2_000, surface: 'current', snippet: 'needle' }], capped: false,
    }),
    trace: presentation.formatSessionTrace(
      { target: session as never, ancestors: [], descendants: [], complete: true, root: session as never } as never,
      [], false, [{ record: sessionRecord('s2', true, true) as never, descendants: [{ record: sessionRecord('s3', true, true) as never, descendants: [] }] }], titles,
    ),
    eventTrace: presentation.formatEventTrace('s1' as never, title, {
      session: { id: 's1' as never, createdAt: 1_000 } as never,
      target: { sessionId: 's1' as never, seq: 2 as never, type: 'tool/call', time: 2_000, surface: 'current' },
      replacementChain: [], replacedEventSeqs: [], sourceEventSeqs: [], derivedEventSeqs: [],
    }),
    eventRead: presentation.formatEventRead('s1' as never, title, {
      session: {} as never, inheritedEventCount: 0 as never, target: event as never,
      events: [event as never], startSeq: 2 as never, endSeq: 2 as never,
    }),
  }
}
