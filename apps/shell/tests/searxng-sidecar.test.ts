import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import { SearxngSidecar, type SearxngSidecarOptions } from '../src/main/searxng-sidecar.js'
import type { launchHidden, killProcessTree } from '../src/main/freecode-launcher.js'

type LaunchOptions = Parameters<typeof launchHidden>[0]
type Log = { level: string, msg: string, meta?: Record<string, unknown> }

class FakeProcess extends EventEmitter {
  exitCode: number | null = null
  readonly pid: number
  constructor(pid: number) {
    super()
    this.pid = pid
  }
}

const RUNTIME = join('C:', 'FreeCode', 'searxng-runtime')
const SETTINGS = join('C:', 'FreeCode', 'searxng-search', 'settings.yml')
const TEMP = join('C:', 'FreeCode', 'web-search', 'tmp')
const PORT = 48123

const ENV_KEYS = ['PYTHONDONTWRITEBYTECODE', 'PYTHONUTF8', 'SEARXNG_SECRET', 'SEARXNG_SETTINGS_PATH', 'SYSTEMROOT', 'TEMP', 'TMP']

let savedKey: string | undefined
beforeEach(() => {
  savedKey = process.env['DEEPSEEK_API_KEY']
  process.env['DEEPSEEK_API_KEY'] = 'sk-test-should-not-leak'
})
afterEach(() => {
  if (savedKey === undefined) delete process.env['DEEPSEEK_API_KEY']
  else process.env['DEEPSEEK_API_KEY'] = savedKey
})

function harness(overrides: Partial<SearxngSidecarOptions> = {}) {
  const launches: Array<{ options: LaunchOptions, proc: FakeProcess }> = []
  const kills: number[] = []
  const logs: Log[] = []
  let nextPid = 4000
  const launch = (options: LaunchOptions) => {
    const proc = new FakeProcess(++nextPid)
    launches.push({ options, proc })
    return { proc: proc as unknown as ChildProcess, metrics: {} as never }
  }
  const kill = ((pid: number) => {
    kills.push(pid)
    const found = launches.find(item => item.proc.pid === pid)
    setTimeout(() => { if (found) { found.proc.exitCode = 0; found.proc.emit('exit', 0, null) } }, 5)
  }) as typeof killProcessTree
  const sidecar = new SearxngSidecar({
    runtimeDir: RUNTIME,
    settingsPath: SETTINGS,
    tempDir: TEMP,
    port: PORT,
    launch: launch as unknown as typeof launchHidden,
    kill,
    backoffBaseMs: 1,
    restartBudget: 3,
    log: (level, msg, meta) => logs.push({ level, msg, meta }),
    ...overrides,
  })
  return { sidecar, launches, kills, logs }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('SearxngSidecar', () => {
  it('start launches python.exe from the runtime dir with granian on loopback and cwd at app', () => {
    const { sidecar, launches } = harness()
    sidecar.start()
    expect(launches).toHaveLength(1)
    const { options } = launches[0]!
    expect(options.executable).toBe(join(RUNTIME, 'python', 'python.exe'))
    expect(options.cwd).toBe(join(RUNTIME, 'app'))
    expect(options.args).toEqual(expect.arrayContaining(['-m', 'granian', '--host', '127.0.0.1', '--port', String(PORT)]))
    expect(options.args?.at(-1)).toBe('searx.webapp:app')
    expect(sidecar.pid).toBe(launches[0]!.proc.pid)
  })

  it('passes only the seven listed environment keys, so no API key leaks', () => {
    const { sidecar, launches } = harness()
    sidecar.start()
    const env = launches[0]!.options.env ?? {}
    expect(Object.keys(env).sort()).toEqual(ENV_KEYS)
    expect(JSON.stringify(env)).not.toContain('sk-test-should-not-leak')
    expect(env['SEARXNG_SETTINGS_PATH']).toBe(SETTINGS)
  })

  it('uses a 64-hex secret that differs between two launches', () => {
    const first = harness()
    first.sidecar.start()
    const second = harness()
    second.sidecar.start()
    const a = String(first.launches[0]!.options.env?.['SEARXNG_SECRET'])
    const b = String(second.launches[0]!.options.env?.['SEARXNG_SECRET'])
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it('start called twice launches once', () => {
    const { sidecar, launches } = harness()
    sidecar.start()
    sidecar.start()
    expect(launches).toHaveLength(1)
  })

  it('an unexpected exit respawns on the same port with backoff', async () => {
    const { sidecar, launches } = harness()
    sidecar.start()
    launches[0]!.proc.exitCode = 1
    launches[0]!.proc.emit('exit', 1, null)
    await wait(30)
    expect(launches).toHaveLength(2)
    expect(launches[1]!.options.args).toEqual(expect.arrayContaining(['--port', String(PORT)]))
    sidecar.stop()
  })

  it('gives up after the restart budget without throwing', async () => {
    const { sidecar, launches, logs } = harness({ restartBudget: 2 })
    sidecar.start()
    for (let i = 0; i < 10; i += 1) {
      const last = launches[launches.length - 1]!
      last.proc.exitCode = 1
      last.proc.emit('exit', 1, null)
      await wait(15)
    }
    expect(launches).toHaveLength(3)
    expect(logs.some(log => log.msg === 'searxng gave up after restarts')).toBe(true)
  })

  it('a launch that throws is logged and does not throw from start', () => {
    const { sidecar, logs } = harness({
      launch: (() => { throw new Error('spawn denied') }) as unknown as typeof launchHidden,
    })
    expect(() => sidecar.start()).not.toThrow()
    expect(logs.some(log => log.msg === 'searxng launch failed' && log.level === 'warn')).toBe(true)
  })

  it('stop calls kill with the child PID and resolves after exit', async () => {
    const { sidecar, launches, kills } = harness()
    sidecar.start()
    const pid = launches[0]!.proc.pid
    await sidecar.stop()
    expect(kills).toEqual([pid])
    expect(sidecar.pid).toBeNull()
  })

  it('does not respawn after stop, including a pending backoff timer', async () => {
    const { sidecar, launches } = harness({ backoffBaseMs: 50 })
    sidecar.start()
    launches[0]!.proc.exitCode = 1
    launches[0]!.proc.emit('exit', 1, null)
    await sidecar.stop()
    await wait(120)
    expect(launches).toHaveLength(1)
  })

  it('never logs the secret in any message or metadata', () => {
    const { sidecar, launches, logs } = harness()
    sidecar.start()
    const secret = String(launches[0]!.options.env?.['SEARXNG_SECRET'])
    launches[0]!.proc.emit('exit', 1, null)
    sidecar.start()
    expect(JSON.stringify(logs)).not.toContain(secret)
    expect(logs.length).toBeGreaterThan(0)
    sidecar.stop()
  })
})
