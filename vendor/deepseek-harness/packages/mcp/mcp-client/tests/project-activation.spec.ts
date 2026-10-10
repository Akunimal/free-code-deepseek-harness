import { describe, expect, it, vi } from 'vitest'
import { canonicalProjectPath, createProjectActivationState, withProjectActivation } from '../src/project-activation.ts'

type Result = { isError?: boolean; content?: Array<{ type: string; text?: string }> }
type Execution = { id: string; signal: AbortSignal }

const activation = { toolName: 'activate_project', pathArgument: 'project' }

describe('project activation', () => {
  it('canonicalizes the workspace and activates it before the requested tool', async () => {
    const state = createProjectActivationState()
    const project = canonicalProjectPath(process.cwd())
    const calls: string[] = []
    const execution: Execution = { id: 'one', signal: new AbortController().signal }
    const result = await withProjectActivation<Result, Execution>({
      rawName: 'find_symbol',
      args: { name: 'target' },
      execution,
      project,
      config: activation,
      state,
      activate: async requested => {
        calls.push(`activate:${requested}`)
        return { content: [{ type: 'text', text: 'activated' }] }
      },
      call: async args => {
        calls.push(`tool:${String(args.name)}`)
        return { content: [{ type: 'text', text: 'found' }] }
      },
    })

    expect(calls).toEqual([`activate:${project}`, 'tool:target'])
    expect(result.content?.[0]?.text).toBe('found')
    expect(state.activeProject).toBe(project)
  })

  it('serializes activation and dependent calls when sessions switch workspaces', async () => {
    const state = createProjectActivationState()
    const projectA = canonicalProjectPath(process.cwd())
    const projectB = canonicalProjectPath('packages')
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const events: string[] = []
    const call = (id: string, project: string) => withProjectActivation<Result, Execution>({
      rawName: 'find_symbol',
      args: { id },
      execution: { id, signal: new AbortController().signal },
      project,
      config: activation,
      state,
      activate: async requested => {
        events.push(`activate:${id}:${requested}`)
        if (id === 'A') {
          started.resolve()
          await release.promise
        }
        return { content: [] }
      },
      call: async () => {
        events.push(`tool:${id}`)
        return { content: [] }
      },
    })

    const first = call('A', projectA)
    await started.promise
    const second = call('B', projectB)
    expect(events).toEqual([`activate:A:${projectA}`])
    release.resolve()
    await Promise.all([first, second])
    expect(events).toEqual([
      `activate:A:${projectA}`,
      'tool:A',
      `activate:B:${projectB}`,
      'tool:B',
    ])
  })

  it('does not call the requested tool after activation fails and does not poison the queue', async () => {
    const state = createProjectActivationState()
    const project = canonicalProjectPath(process.cwd())
    const call = vi.fn(async () => ({ content: [] }))
    const activate = vi.fn(async () => ({ isError: true, content: [{ type: 'text', text: 'denied' }] }))
    const params = {
      rawName: 'find_symbol',
      args: {},
      execution: { id: 'failed', signal: new AbortController().signal },
      project,
      config: activation,
      state,
      activate,
      call,
      activationError: (result: Result) => new Error(result.content?.[0]?.text ?? 'failed'),
    }

    await expect(withProjectActivation<Result, Execution>(params)).rejects.toThrow('denied')
    expect(call).not.toHaveBeenCalled()
    expect(state.activeProject).toBeUndefined()

    activate.mockResolvedValueOnce({ content: [] })
    await withProjectActivation<Result, Execution>({ ...params, execution: { id: 'retry', signal: new AbortController().signal } })
    expect(activate).toHaveBeenCalledTimes(2)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('bypasses activation when the execution has no selected workspace', async () => {
    const state = createProjectActivationState()
    const activate = vi.fn()
    const call = vi.fn(async () => ({ content: [] }))
    await withProjectActivation<Result, Execution>({
      rawName: 'find_symbol',
      args: {},
      execution: { id: 'no-cwd', signal: new AbortController().signal },
      project: undefined,
      config: activation,
      state,
      activate,
      call,
    })
    expect(activate).not.toHaveBeenCalled()
    expect(call).toHaveBeenCalledOnce()
  })
})
