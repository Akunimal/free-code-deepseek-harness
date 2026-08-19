import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { spawnSubprocess } from '../src/spawn.ts'

function spec() {
  return {
    argv: ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Write-Output hidden'],
    cwd: process.cwd(),
    stdio: {
      stdin: 'ignore' as const,
      stdout: { maxBytes: 1_000 },
      stderr: { maxBytes: 1_000 },
    },
    graceMs: 1_000,
  }
}

describe('Windows headless subprocesses', () => {
  it('hides tool consoles and keeps termination headless', async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      stdin: null,
      stdout: null,
      stderr: null,
      exitCode: null,
      signalCode: null,
    }) as unknown as ChildProcess
    let options: Record<string, unknown> | undefined
    const spawnOverride = vi.fn((...args: unknown[]) => {
      options = args[2] as Record<string, unknown>
      return child
    }) as unknown as typeof import('node:child_process').spawn

    const running = spawnSubprocess(spec(), {
      platform: 'win32',
      spawn: spawnOverride,
    })

    expect(options).toEqual(expect.objectContaining({ windowsHide: true, detached: false }))
    child.emit('close', 0, null)
    await running.done
  })
})
