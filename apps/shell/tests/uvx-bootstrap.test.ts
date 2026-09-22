import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureUvxCommand } from '../src/main/uvx-bootstrap.js'

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('uvx bootstrap', () => {
  it('does not bootstrap on non-Windows platforms', async () => {
    const fetchImpl = vi.fn()
    await expect(ensureUvxCommand({
      platform: 'linux',
      userDataDir: mkdtempSync(join(tmpdir(), 'freecode-uvx-')),
      fetchImpl,
    })).resolves.toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reuses a user-installed uvx without downloading anything', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'freecode-uvx-'))
    dirs.push(userDataDir)
    const userUvx = join(userDataDir, 'user-uvx.exe')
    writeFileSync(userUvx, 'MZ user uvx')
    const fetchImpl = vi.fn()
    await expect(ensureUvxCommand({
      platform: 'win32',
      userDataDir,
      fetchImpl,
      // No vendored payload in this scenario: PATH reuse must win without
      // any download attempt.
      vendoredRoots: [],
      pathLookup: () => userUvx,
    })).resolves.toBe(userUvx)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('prefers the vendored payload over a user-installed uvx', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'freecode-uvx-'))
    dirs.push(userDataDir)
    const payloadRoot = mkdtempSync(join(tmpdir(), 'freecode-uvx-payload-'))
    dirs.push(payloadRoot)
    const vendoredDir = join(payloadRoot, 'freecode', 'uv')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(vendoredDir, { recursive: true })
    const vendoredUvx = join(vendoredDir, 'uvx.exe')
    writeFileSync(vendoredUvx, 'MZ vendored uvx')
    const fetchImpl = vi.fn()
    await expect(ensureUvxCommand({
      platform: 'win32',
      userDataDir,
      fetchImpl,
      vendoredRoots: [payloadRoot],
      pathLookup: () => join(userDataDir, 'user-uvx.exe'),
    })).resolves.toBe(vendoredUvx)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
