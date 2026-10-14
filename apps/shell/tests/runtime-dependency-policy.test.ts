import { describe, expect, it } from 'vitest'
import { missingRuntimeDependencyIsFailure } from '../../../scripts/runtime-dependency-policy.mjs'

describe('runtime dependency policy', () => {
  it('fails closed when a required runtime dependency is absent', () => {
    expect(missingRuntimeDependencyIsFailure({ id: 'tor', required: true })).toBe(true)
  })

  it('allows declared optional tools to be absent when PATH fallback is supported', () => {
    expect(missingRuntimeDependencyIsFailure({ id: 'free-search', required: false })).toBe(false)
  })
})
