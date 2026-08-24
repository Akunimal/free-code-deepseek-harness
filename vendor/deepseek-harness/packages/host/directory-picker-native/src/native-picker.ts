/** Cross-platform native single-directory chooser behind the native backend's capability. */

import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { pickWin32Directory } from './win32-dialog.ts'

/** Testable command boundary; native implementations never invoke a shell. */
export type DirectoryPickerRunner = NativeCommandRunner

/** Injectable platform facts for deterministic adapter tests. */
export interface DirectoryPickerInternals {
  platform?: NodeJS.Platform
  run?: DirectoryPickerRunner
  /** Replaces the in-process Win32 dialog (`pickWin32Directory`) for deterministic tests. */
  pickWin32Dialog?: (signal: AbortSignal) => Promise<string | null>
  /** Dialog bridge env snapshot; defaults to `process.env`. */
  env?: Partial<Record<'FREECODE_DIALOG_BRIDGE_ENDPOINT' | 'FREECODE_DIALOG_BRIDGE_TOKEN', string>>
}

function outputPath(stdout: string): string | null {
  const path = stdout.replace(/[\r\n]+$/, '')
  return path === '' ? null : path
}

function errorCode(error: unknown): string | number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}

function errorStderr(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('stderr' in error)) return ''
  const stderr = (error as { stderr?: unknown }).stderr
  return typeof stderr === 'string' ? stderr : ''
}

function isMissingCommand(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

function rethrowIfAborted(signal: AbortSignal, error: unknown): void {
  if (signal.aborted) throw error
}

/**
 * Pick a directory via the Electron shell's dialog bridge. The bridge is a
 * loopback HTTP endpoint the Electron main process exposes when the Harness
 * runs as its child; it delegates to `dialog.showOpenDialog` — the same
 * native Win32 IFileOpenDialog the koffi worker would open, but routed
 * through the Electron process whose binary CAN load the COM surface.
 */
async function pickViaBridge(
  endpoint: string, token: string, signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-freecode-dialog-token': token, 'content-type': 'application/json' },
    body: '{}',
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`dialog bridge returned ${response.status}: ${text}`)
  }
  const data = await response.json() as { path?: string | null; error?: string }
  if (data.error) throw new Error(`dialog bridge: ${data.error}`)
  return data.path ?? null
}

/**
 * Open the platform directory picker.
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform and runner hooks for deterministic tests.
 * @returns the selected path, or null when the user cancels.
 */
export async function pickNativeDirectory(
  signal: AbortSignal,
  internals: DirectoryPickerInternals = {},
): Promise<string | null> {
  const platform = internals.platform ?? process.platform
  const run = internals.run ?? runNativeCommand

  if (platform === 'darwin') {
    try {
      const result = await run('osascript', [
        '-e', 'set selectedFolder to choose folder with prompt "Select Workspace Directory"',
        '-e', 'POSIX path of selectedFolder',
      ], signal)
      return outputPath(result.stdout)
    } catch (error: unknown) {
      if (!signal.aborted && errorCode(error) === 1
        && /(?:User canceled|-128)/i.test(errorStderr(error))) return null
      throw error
    }
  }

  if (platform === 'win32') {
    const env = internals.env ?? process.env
    const bridgeEndpoint = env.FREECODE_DIALOG_BRIDGE_ENDPOINT
    const bridgeToken = env.FREECODE_DIALOG_BRIDGE_TOKEN
    if (bridgeEndpoint && bridgeToken) {
      return await pickViaBridge(bridgeEndpoint, bridgeToken, signal)
    }
    const pickDialog = internals.pickWin32Dialog ?? pickWin32Directory
    return await pickDialog(signal)
  }

  if (platform === 'linux') {
    try {
      const result = await run('zenity', [
        '--file-selection', '--directory', '--title=Select Workspace Directory',
      ], signal)
      return outputPath(result.stdout)
    } catch (error: unknown) {
      rethrowIfAborted(signal, error)
      if (errorCode(error) === 1) return null
      if (!isMissingCommand(error)) throw error
    }

    try {
      const result = await run('kdialog', [
        '--getexistingdirectory', '.', '--title', 'Select Workspace Directory',
      ], signal)
      return outputPath(result.stdout)
    } catch (error: unknown) {
      rethrowIfAborted(signal, error)
      if (errorCode(error) === 1) return null
      if (isMissingCommand(error)) {
        throw new Error('no supported native directory picker found (install zenity or kdialog)')
      }
      throw error
    }
  }

  throw new Error(`native directory picker is unsupported on ${platform}`)
}
