import { describe, expect, it } from 'vitest'
import { shouldNotifyBackendState } from '../src/main/backend-state.js'

describe('backend state notifications', () => {
  it('does not notify for the initial ready state', () => {
    expect(shouldNotifyBackendState('unknown', 'ready', false)).toBe(false)
  })

  it('notifies for a real runtime transition', () => {
    expect(shouldNotifyBackendState('ready', 'down', false)).toBe(true)
    expect(shouldNotifyBackendState('down', 'ready', false)).toBe(true)
  })

  it('suppresses expected worker teardown transitions', () => {
    expect(shouldNotifyBackendState('ready', 'down', true)).toBe(false)
  })
})
