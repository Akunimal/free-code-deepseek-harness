/** Caveman context compression — optional user-installed accelerator.
 *  Detection is best effort; if the binary is missing the feature is
 *  silently unavailable. */

import { spawnSync } from 'node:child_process'

/** Check whether the caveman binary is available on PATH. */
export function resolveCaveman(): boolean {
  try {
    const result = spawnSync('caveman', ['--version'], {
      timeout: 2_000,
      stdio: 'ignore',
      windowsHide: true,
    })
    return result.status === 0
  } catch {
    return false
  }
}

/** Commands whose output is safe for Caveman to compress. */
const CAVEMAN_COMMANDS = new Set([
  'cat', 'head', 'tail', 'grep', 'rg', 'find', 'ls', 'dir',
  'git', 'pnpm', 'npm', 'yarn', 'node', 'python', 'pip',
])

/** Whether a command is eligible for Caveman compression. */
function canUseCaveman(command: string): boolean {
  const executable = command.trim().split(/\s+/)[0]?.split('/').pop()?.split('\\').pop()
  return executable !== undefined && CAVEMAN_COMMANDS.has(executable)
}

/** Add the Caveman prefix only when the caller enabled it and the command is eligible. */
export function wrapWithCaveman(command: string, available: boolean): string {
  return available && canUseCaveman(command) ? `caveman compress --stdin "${command}"` : command
}
