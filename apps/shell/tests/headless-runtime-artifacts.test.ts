import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { verifyHeadlessRuntime } from '../../../scripts/verify-headless-runtime.mjs'

const shellRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = join(shellRoot, 'resources', 'freecode', 'dsh')

function runtimeFile(path: string): string {
  return readFileSync(join(runtimeRoot, path), 'utf8')
}

describe('packaged DSH headless-process artifacts', () => {
  it('passes the prepackage gate against the generated runtime', () => {
    expect(verifyHeadlessRuntime(runtimeRoot)).toEqual({ checked: 21 })
  })

  it('rejects a packaged runtime missing the persistent PowerShell hide default', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'dsh-headless-stale-runtime-'))
    const staleBundle = join(scratch, 'packages/shell/tool-pwsh-persistent/lib/index.js')
    mkdirSync(dirname(staleBundle), { recursive: true })
    writeFileSync(staleBundle, 'Start-Process:WindowStyle = "Normal"')

    try {
      expect(() => verifyHeadlessRuntime(scratch)).toThrow(/persistent PowerShell reasserts the hidden Start-Process default/u)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('ships the persistent PowerShell Start-Process window default', () => {
    const bundle = runtimeFile('packages/shell/tool-pwsh-persistent/lib/index.js')

    expect(bundle).toContain('Start-Process:WindowStyle')
    expect(bundle).toMatch(/Start-Process:WindowStyle.{0,80}Hidden/su)
  })

  it('ships the node-pty cleanup helper with hidden, piped stdio', () => {
    const source = runtimeFile('node_modules/node-pty/lib/windowsPtyAgent.js')
    const cleanupAgentFork = source.split('\n').find(line => line.includes('conpty_console_list_agent'))

    expect(cleanupAgentFork).toContain('silent: true')
    expect(cleanupAgentFork).toContain('windowsHide: true')
  })

  it('ships the web-app opener with its console launcher hidden', () => {
    const bundle = runtimeFile('packages/bundle/web-app/lib/index.js')

    expect(bundle).toContain('windowsHide: true')
  })

  it.each([
    ['packages/experimental/ptc-runtime-python/lib/index.js', 2, 'PTC Python probe and worker'],
    ['packages/sandbox/sandbox-local/lib/index.js', 3, 'sandbox runner probes'],
    ['packages/sdk/client/lib/index.js', 1, 'SDK runtime child'],
    ['packages/ssh/ssh/lib/index.js', 2, 'SSH command and transport children'],
    ['packages/subprocess/subprocess-local/lib/index.js', 1, 'ordinary subprocess fallback'],
    ['packages/host/directory-picker-native/lib/index.js', 2, 'native dialog helper'],
    ['packages/llm/llm/lib/index.js', 1, 'OCR worker'],
    ['native/system/packages/entry/lib/index.js', 1, 'Landlock probe'],
    ['apps/desktop/src/host-process.ts', 1, 'desktop Host process'],
    ['apps/desktop/src/login-shell-environment.ts', 1, 'desktop login-shell probe'],
    ['packages/test-support/session-snapshot/src/launcher.ts', 1, 'session-snapshot agent'],
    ['packages/shell/shell/src/rtk.ts', 1, 'RTK availability probe'],
    ['packages/shell/shell/src/caveman.ts', 1, 'Caveman availability probe'],
    ['apps/desktop/src/command-manager-entry.ts', 1, 'command manager PowerShell worker'],
    ['apps/desktop/src/command-management.ts', 1, 'command manager Node worker'],
  ])('ships windowsHide on every %s launch (%s)', (path, minimum, description) => {
    const bundle = runtimeFile(path)
    const count = bundle.match(/windowsHide\s*:\s*true/gu)?.length ?? 0

    expect(count, description).toBeGreaterThanOrEqual(minimum)
  })

  it('ships open-in-app with hidden as its default console-window policy', () => {
    const bundle = runtimeFile('packages/host/open-in-app/lib/index.js')

    expect(bundle).toMatch(/windowsHide\s*:\s*options\.windowsHide\s*\?\?\s*true/u)
  })

  it('ships one-shot PowerShell with Start-Process hidden by default', () => {
    const bundle = runtimeFile('packages/shell/pwsh-local/lib/index.js')

    expect(bundle).toMatch(/Start-Process:WindowStyle.{0,80}Hidden/su)
  })

  it('preserves the explicit GUI-visible branch in native command launches', () => {
    const source = runtimeFile('packages/util/native-command/src/runner.ts')

    expect(source).toMatch(/windowsHide:\s*window\s*===\s*'hidden'/u)
  })
})
