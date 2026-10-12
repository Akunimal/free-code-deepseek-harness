import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: spawnSyncMock,
}))

const { isPwshAvailable } = await import('./pwsh-probe.ts')

afterEach(() => { spawnSyncMock.mockReset() })

describe('PowerShell availability probe', () => {
  it('hides its probe window and uses the shared resolved pwsh command', () => {
    spawnSyncMock.mockReturnValue({ status: 0 })

    expect(isPwshAvailable()).toBe(true)
    expect(spawnSyncMock).toHaveBeenCalledWith(
      expect.any(String),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$true'],
      expect.objectContaining({ encoding: 'utf8', windowsHide: true }),
    )
  })

  it.each([
    'vitest.config.ts',
    'snapshots/session/headless.snapshot.ts',
    'packages/shell/tool-pwsh/tests/loader.spec.ts',
    'packages/shell/tool-pwsh/tests/integration.spec.ts',
    'packages/shell/pwsh-local/tests/executor.spec.ts',
    'packages/shell/pwsh-sandbox/tests/sandbox.spec.ts',
    'packages/shell/pwsh-sandbox/tests/acl.e2e.ts',
    'packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts',
    'apps/web/tests/pwsh-terminal.e2e.ts',
    'packages/terminal/terminal-bash/tests/local.spec.ts',
    'packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts',
  ])(
    'routes %s through the shared hidden PowerShell probe',
    (path) => {
      const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
      const source = readFileSync(join(repoRoot, path), 'utf8')
      expect(source).toContain('isPwshAvailable()')
      expect(source).not.toMatch(/spawnSync\(resolvePwshPath\(/u)
    },
  )

  it.each([
    'packages/sandbox/sandbox-windows-acl/tests/probe.spec.ts',
    'packages/sandbox/sandbox-windows-acl/tests/diagnose-script.spec.ts',
  ])('hides the Windows executable lookup in %s', (path) => {
    const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
    const source = readFileSync(join(repoRoot, path), 'utf8')
    expect(source).toMatch(/execFileSync\('where\.exe',[\s\S]{0,160}windowsHide:\s*true/u)
  })
})
