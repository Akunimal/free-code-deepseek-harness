import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/** Optional per-session project activation for servers with one active workspace. */
export interface ProjectActivationConfig {
  /** Raw MCP tool that selects the active project. */
  toolName: string
  /** Required string argument that receives the selected session cwd. */
  pathArgument: string
}

/** Mutable state shared by all tools owned by one MCP connection generation. */
export interface ProjectActivationState {
  chain: Promise<void>
  activeProject: string | undefined
}

/** Minimal MCP result surface required by the activation coordinator. */
export interface ProjectActivationResult {
  isError?: boolean
  content?: unknown[]
  toolResult?: unknown
}

/** Create fresh activation state for one MCP connection generation. */
export function createProjectActivationState(): ProjectActivationState {
  return { chain: Promise.resolve(), activeProject: undefined }
}

/** Canonicalize a workspace while allowing sessions whose directory was deleted. */
export function canonicalProjectPath(project: string): string {
  const absolute = resolve(project)
  try {
    return realpathSync.native(absolute)
  } catch {
    return absolute
  }
}

export interface ProjectActivationCallOptions<Result extends ProjectActivationResult, Execution extends { signal: AbortSignal }> {
  rawName: string
  args: Record<string, unknown>
  execution: Execution
  project: string | undefined
  config: ProjectActivationConfig | undefined
  state: ProjectActivationState | undefined
  call(args: Record<string, unknown>, execution: Execution): Promise<Result>
  activate?(project: string, execution: Execution): Promise<Result>
  activationError?(result: Result, toolName: string): Error
}

/** Serialize activation with its dependent call so concurrent sessions cannot switch server state mid-call. */
export function withProjectActivation<Result extends ProjectActivationResult, Execution extends { signal: AbortSignal }>(
  options: ProjectActivationCallOptions<Result, Execution>,
): Promise<Result> {
  const { rawName, args, execution, project, config, state } = options
  if (config === undefined || state === undefined || project === undefined) {
    return options.call(args, execution)
  }

  const run = state.chain.catch(() => {}).then(async () => {
    if (execution.signal.aborted) {
      const reason = execution.signal.reason
      throw reason instanceof Error ? reason : new Error('MCP tool call aborted')
    }

    if (rawName !== config.toolName && state.activeProject !== project) {
      if (options.activate === undefined) {
        throw new Error(`project activation tool "${config.toolName}" is not available from the MCP server`)
      }
      const activated = await options.activate(project, execution)
      if (activated.isError === true) {
        throw options.activationError?.(activated, config.toolName)
          ?? new Error(`project activation via MCP tool "${config.toolName}" failed`)
      }
      state.activeProject = project
    }

    const result = await options.call(args, execution)
    if (rawName === config.toolName && result.isError !== true) {
      const requested = args[config.pathArgument]
      if (typeof requested === 'string' && requested.length > 0) {
        state.activeProject = canonicalProjectPath(requested)
      }
    }
    return result
  })

  // One failed call must not poison later work queued for this server.
  state.chain = run.then(() => undefined, () => undefined)
  return run
}
