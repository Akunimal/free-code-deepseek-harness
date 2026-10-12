import { afterEach, describe, expect, it, vi } from 'vitest'

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }))
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: execFileSyncMock,
}))

const { composeProfile } = await import('../src/repository.ts')

afterEach(() => { execFileSyncMock.mockReset() })

describe('composeProfile child process options', () => {
  it('keeps its build-time Node helper console hidden on Windows', () => {
    execFileSyncMock.mockReturnValue('profile: fixture\n')

    expect(composeProfile('C:/checkout', 'fixture')).toBe('profile: fixture\n')
    expect(execFileSyncMock.mock.calls[0]?.[2]).toMatchObject({ windowsHide: true })
  })
})
