import { describe, it, expect } from 'vitest'
import { wrapWithCaveman } from '../../shell/src/caveman.ts'

describe('optional Caveman command wrapper', () => {
  it('wraps supported plain commands only when Caveman is available', () => {
    expect(wrapWithCaveman('git status', true)).toBe('caveman compress --stdin "git status"')
    expect(wrapWithCaveman('ls -la', true)).toBe('caveman compress --stdin "ls -la"')
    expect(wrapWithCaveman('cat file.txt', true)).toBe('caveman compress --stdin "cat file.txt"')
  })

  it('does not wrap unsupported commands', () => {
    expect(wrapWithCaveman('echo hello', true)).toBe('echo hello')
    expect(wrapWithCaveman('pwd', true)).toBe('pwd')
  })

  it('does not wrap compound shell commands', () => {
    expect(wrapWithCaveman('cat file | grep foo', true)).toBe('cat file | grep foo')
    expect(wrapWithCaveman('echo hello && ls', true)).toBe('echo hello && ls')
  })

  it('does not wrap when Caveman is not available', () => {
    expect(wrapWithCaveman('git status', false)).toBe('git status')
    expect(wrapWithCaveman('ls -la', false)).toBe('ls -la')
  })
})
