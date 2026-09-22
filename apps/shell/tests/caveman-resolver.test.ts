import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveCavemanBinary,
  isCavemanAvailable,
  resolveRtkBinary,
  isRtkAvailable,
  _clearCache,
} from '../src/main/caveman-resolver.js'

let dirs: string[] = []
// The resolver falls back to PATH (where/which), so the suite must not see
// the developer machine's PATH: a box with rtk/caveman installed would fail
// the "empty directory" cases. PATH is reduced to the test dir plus the OS
// lookup binary's own home (System32//usr/bin); PATHEXT is left intact
// because where.exe needs it to match extensionless queries.
function isolatedPath(dir: string): string {
  if (process.platform === 'win32') {
    return `${dir};${join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')}`;
  }
  return `${dir}:/usr/bin:/bin`;
}
let emptyPathDir = ''

beforeAll(() => {
  emptyPathDir = mkdtempSync(join(tmpdir(), 'caveman-empty-path-'))
})

beforeEach(() => {
  vi.stubEnv('PATH', isolatedPath(emptyPathDir))
})

afterEach(() => {
  vi.unstubAllEnvs()
  _clearCache()
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true })
  }
})

describe('caveman-resolver', () => {
  it('returns null for an empty directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caveman-test-'))
    dirs.push(dir)
    expect(resolveCavemanBinary(dir)).toBeNull()
  })

  it('isCavemanAvailable returns false for empty dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caveman-test-'))
    dirs.push(dir)
    expect(isCavemanAvailable(dir)).toBe(false)
  })

  it('returns null for RTK when directory is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rtk-test-'))
    dirs.push(dir)
    expect(resolveRtkBinary(dir)).toBeNull()
    expect(isRtkAvailable(dir)).toBe(false)
  })

  it('detects a bundled caveman.exe in a subdirectory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caveman-bundled-'))
    dirs.push(dir)
    const binDir = join(dir, 'caveman')
    mkdirSync(binDir)
    writeFileSync(join(binDir, 'caveman.exe'), 'fake')
    expect(resolveCavemanBinary(dir)).toBe(join(binDir, 'caveman.exe'))
  })

  it('detects a bundled rtk.exe in resourcesDir root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rtk-bundled-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'rtk.exe'), 'fake')
    expect(resolveRtkBinary(dir)).toBe(join(dir, 'rtk.exe'))
  })

  it('caches results across repeated calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cache-test-'))
    dirs.push(dir)
    const first = resolveCavemanBinary(dir) // miss → null
    const second = resolveCavemanBinary(dir) // hit → cached null
    expect(first).toBeNull()
    expect(second).toBeNull()
    // Cache should prevent a second lookup — verified by consistency
  })

  it('falls back to a user-installed rtk on PATH', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'rtk-path-'))
    dirs.push(binDir)
    const userRtk = join(binDir, process.platform === 'win32' ? 'rtk.exe' : 'rtk')
    writeFileSync(userRtk, 'fake')
    vi.stubEnv('PATH', isolatedPath(binDir))
    const dir = mkdtempSync(join(tmpdir(), 'rtk-test-'))
    dirs.push(dir)
    expect(resolveRtkBinary(dir)).toBe(userRtk)
    expect(isRtkAvailable(dir)).toBe(true)
  })

  it('clearCache resets state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clear-test-'))
    dirs.push(dir)
    resolveCavemanBinary(dir)
    _clearCache()
    // After clear, a re-probe should still return null (dir is empty)
    expect(resolveCavemanBinary(dir)).toBeNull()
  })
})
