import { spawnSync } from 'node:child_process'
import { resolvePwshPath } from '../packages/shell/pwsh-local/src/resolve.ts'

const PWSH_PROBE_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$true']

/** Probe the same PowerShell executable used by shell tests without flashing a console on Windows. */
export function isPwshAvailable(): boolean {
  return spawnSync(resolvePwshPath(), PWSH_PROBE_ARGS, { encoding: 'utf8', windowsHide: true }).status === 0
}
