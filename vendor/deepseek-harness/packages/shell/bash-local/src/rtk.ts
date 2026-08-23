import { spawnSync } from 'node:child_process'

/** Commands whose plain output is safe for RTK to summarize. Shell syntax,
 * pipelines and redirections stay untouched so RTK can never change command
 * semantics or hide an operator-controlled compound command. */
const RTK_COMMANDS = new Set([
  'bun', 'cargo', 'docker', 'gh', 'git', 'go', 'kubectl', 'npm', 'npx',
  'pnpm', 'pytest', 'rg', 'ruff', 'rustc', 'vitest', 'yarn',
])

const SHELL_META = /[|&;<>`$(){}]/

export function canUseRtk(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed || SHELL_META.test(trimmed)) return false
  const executable = trimmed.split(/\s+/, 1)[0]
  return executable !== undefined && RTK_COMMANDS.has(executable)
}

export function wrapWithRtk(command: string, available: boolean): string {
  return available && canUseRtk(command) ? `rtk ${command}` : command
}

/** RTK is an optional user-installed accelerator. Detection is deliberately
 * best effort and has no side effects; a missing binary is a no-op fallback. */
export function resolveRtk(): boolean {
  try {
    return spawnSync('rtk', ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    }).status === 0
  } catch {
    return false
  }
}
