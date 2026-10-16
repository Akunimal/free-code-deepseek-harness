// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { ConversationMainPanel } from '../src/client/skeleton/ConversationMainPanel.tsx'
import { PHOENIX_PATTERNS, pickPhoenixPattern, startPhoenixPattern, createPhoenixClock } from '../src/client/skeleton/phoenixPatterns.ts'

vi.mock('../src/client/skeleton/ConversationWidthControls.tsx', () => ({ ConversationWidthControls: () => null }))
let frames: Map<number, FrameRequestCallback>
let next = 0
let disconnected = 0
let textDraws: Array<[string, number, number]> = []
let media: EventTarget & { matches: boolean; addListener: () => void; removeListener: () => void }

beforeEach(() => {
  frames = new Map()
  textDraws = []
  media = Object.assign(new EventTarget(), { matches: false, addListener() {}, removeListener() {} })
  vi.stubGlobal('matchMedia', () => media)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() { disconnected++ } })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, {
    get: (_target, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => ({ addColorStop() {} })
      : key === 'fillText'
        ? (text: string, x: number, y: number) => { textDraws.push([text, x, y]) }
        : () => {},
    set: () => true,
  }) as never)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('ports all nine actual Hermes patterns and never repeats a pick', () => {
  expect(PHOENIX_PATTERNS).toEqual([
    'synapse', 'rain', 'constellations', 'sparkles', 'perlin-flow', 'petals', 'embers', 'bubbles', 'squares',
    'ascii-weather', 'ascii-stars', 'aurora', 'orbitals',
  ])
  let last = pickPhoenixPattern()
  for (let i = 0; i < 50; i++) { const current = pickPhoenixPattern(); expect(current).not.toBe(last); last = current }
})

it('draws original ASCII weather glyphs and advances their positions over animation frames', () => {
  const host = document.createElement('div')
  Object.defineProperties(host, {
    clientWidth: { configurable: true, value: 480 },
    clientHeight: { configurable: true, value: 260 },
  })
  document.body.append(host)
  const stop = startPhoenixPattern('ascii-weather', host)
  const seeded = [...textDraws]
  expect(seeded.length).toBeGreaterThan(0)
  expect(seeded.every(([glyph]) => /^[~*.+\-/\\|^]$/u.test(glyph))).toBe(true)
  const first = [...frames.entries()][0]
  expect(first).toBeDefined()
  frames.delete(first![0]); first![1](100)
  const second = [...frames.entries()][0]
  expect(second).toBeDefined()
  frames.delete(second![0]); second![1](200)
  expect(textDraws.length).toBeGreaterThan(seeded.length)
  expect(textDraws.slice(seeded.length)).not.toEqual(expect.arrayContaining(seeded.slice(-10)))
  stop()
  host.remove()
})

it('uses elapsed time, accelerates work and bounds delayed-frame catch-up', () => {
  const idle = createPhoenixClock(), busy = createPhoenixClock()
  idle(0, false); busy(0, true)
  let slow = 0, fast = 0
  for (let time = 16; time <= 1000; time += 16) { slow += idle(time, false); fast += busy(time, true) }
  expect(fast).toBeGreaterThan(slow * 3)
  expect(busy(60_000, true)).toBeLessThanOrEqual(4)
})

it.each(PHOENIX_PATTERNS)('mounts and disposes %s without retaining a loop or observer', pattern => {
  const host = document.createElement('div'); document.body.append(host)
  const count = disconnected
  const stop = startPhoenixPattern(pattern, host)
  expect(host.querySelectorAll('canvas')).toHaveLength(1)
  expect(frames.size).toBe(1)
  for (const [id, cb] of [...frames]) { frames.delete(id); cb(100) }
  stop(); stop()
  expect(host.querySelector('canvas')).toBeNull()
  expect(frames.size).toBe(0)
  expect(disconnected).toBe(count + 1)
  host.remove()
})

function panel(running: boolean) {
  const props = {
    sessionId: 'fixture',
    useSession: (select: (s: object) => unknown) => select({ running, openState: 'open', blank: false }),
    useConversation: (select: (s: object) => unknown) => select({ activeTargets: new Set(['past-history']) }),
    useSessions: (select: (s: object) => unknown) => select({ byId: { fixture: { blank: false } } }),
    renderSlot: () => <header>Real panel</header>, renderFactorySlot: () => <button>Composer</button>,
  } as unknown as Parameters<typeof ConversationMainPanel>[0]
  return <ConversationMainPanel {...props} />
}

it('keeps one pattern during a stream and crossfades exactly once after finish or stop', () => {
  const view = render(panel(false))
  const host = () => view.container.querySelector<HTMLElement>('[data-phoenix-background]')!
  expect(host().dataset.working).toBe('false')
  const initial = host().dataset.pattern
  view.rerender(panel(true))
  expect(host().dataset.working).toBe('true')
  expect(host().dataset.pattern).toBe(initial)
  expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  act(() => { vi.advanceTimersByTime(90_000) })
  expect(host().dataset.pattern).toBe(initial)
  view.rerender(panel(true))
  expect(host().dataset.pattern).toBe(initial)
  view.rerender(panel(false))
  expect(host().dataset.working).toBe('false')
  expect(host().dataset.pattern).not.toBe(initial)
  expect(host().dataset.transitionFrom).toBe(initial)
  expect(view.container.querySelectorAll('[data-phoenix-layer]')).toHaveLength(2)
  expect(frames.size).toBe(2)
  act(() => { vi.advanceTimersByTime(900) })
  expect(view.container.querySelectorAll('[data-phoenix-layer]')).toHaveLength(1)
  expect(frames.size).toBe(1)
  vi.useRealTimers()
  act(() => { media.matches = true; media.dispatchEvent(new Event('change')) })
  expect(frames.size).toBe(0)
  expect(host().dataset.reducedMotion).toBe('true')
  act(() => { media.matches = false; media.dispatchEvent(new Event('change')) })
  expect(frames.size).toBe(1)
  view.unmount()
  expect(frames.size).toBe(0)
})

it('stops animation while hidden and resumes only one loop when visible', () => {
  const view = render(panel(true))
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(frames.size).toBe(0)
  hidden.mockReturnValue(false)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(frames.size).toBe(1)
  view.unmount(); expect(frames.size).toBe(0)
})
