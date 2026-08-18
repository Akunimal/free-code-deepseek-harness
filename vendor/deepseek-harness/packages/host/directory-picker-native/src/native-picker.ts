/** Cross-platform native single-directory chooser behind the native backend's capability. */

import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { pickWin32Directory } from './win32-dialog.ts'
import { tmpdir } from 'node:os'
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'

/** Testable command boundary; native implementations never invoke a shell. */
export type DirectoryPickerRunner = NativeCommandRunner

/** Injectable platform facts for deterministic adapter tests. */
export interface DirectoryPickerInternals {
  platform?: NodeJS.Platform
  run?: DirectoryPickerRunner
  /** Replaces the in-process Win32 dialog (`pickWin32Directory`) for deterministic tests. */
  pickWin32Dialog?: (signal: AbortSignal) => Promise<string | null>
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
    // Under ELECTRON_RUN_AS_NODE the Electron exe runs as Node but koffi's
    // NAPI surface is incompatible with Electron's runtime, causing a fatal
    // crash in readUtf16. Fall back to the built-in BrowseForFolder COM
    // dialog via cscript (available on every Windows since XP).
    if (process.env.ELECTRON_RUN_AS_NODE) {
      const tag = randomBytes(4).toString('hex')
      const vbs = join(tmpdir(), `dsh-pick-${tag}.vbs`)
      const resultFile = join(tmpdir(), `dsh-pick-${tag}.txt`)
      writeFileSync(vbs, [
        'Set s=CreateObject("Shell.Application")',
        'Set f=s.BrowseForFolder(0,"Select Workspace Directory",&H0041,"")',
        'Dim fso: Set fso=CreateObject("Scripting.FileSystemObject")',
        `Dim out: Set out=fso.CreateTextFile("${resultFile.replace(/\\/g, '\\\\')}", True)`,
        'If Not f Is Nothing Then out.Write f.Self.Path',
        'out.Close',
      ].join('\r\n'))
      try {
        await new Promise<void>((resolve, reject) => {
          const child = execFile('wscript', [vbs], (err) => {
            if (err) reject(err); else resolve()
          })
          const onAbort = (): void => { child.kill(); reject(new Error('native directory picker aborted')) }
          signal.addEventListener('abort', onAbort, { once: true })
        })
        try {
          const picked = readFileSync(resultFile, 'utf-8').trim()
          return picked || null
        } catch { return null }
      } catch (error: unknown) {
        rethrowIfAborted(signal, error)
        return null
      } finally {
        try { unlinkSync(vbs) } catch {}
        try { unlinkSync(resultFile) } catch {}
      }
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
