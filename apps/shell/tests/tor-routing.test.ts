import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveTorProxyCandidates } from '../src/main/tor-routing.js'

const root = join(import.meta.dirname, '../../..')

describe('Tor direct-first recovery route', () => {
  it('keeps the configured SOCKS candidate available even if startup is currently unavailable', () => {
    expect(resolveTorProxyCandidates('socks5://127.0.0.1:19850')).toEqual([
      'direct',
      'socks5://127.0.0.1:19850',
    ])
  })

  it('remains direct-only when there is no configured Tor route', () => {
    expect(resolveTorProxyCandidates(undefined)).toEqual(['direct'])
  })

  it('wires the Tor candidate into gateway startup independently of bootstrap success', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8')
    expect(source).toContain('resolveTorProxyCandidates(torMgr?.proxyUrl)')
  })

  it('initializes Tor status even when the bundled executable is missing', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8')
    expect(source).toContain('const torMgr = new TorManager({')
    expect(source).not.toContain('if (existsSync(torBinaryPath)) {')
    expect(source).toContain('torManager = torMgr')
  })

  it('shows the safely escaped Tor failure reason in the overlay status text', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8')
    expect(source).toContain("msg.textContent = s.status === 'failed' && s.lastError ? s.lastError : ''")
    expect(source).not.toContain('msg.innerHTML = s.lastError')
  })

  it('explains a missing manager without mislabeling the setup as a rotation failure', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8')
    expect(source).toContain('var torUnavailableLabel =')
    expect(source).toContain('esc(torUnavailableLabel)')
    expect(source).not.toContain("tbody.innerHTML = '<tr><td colspan=\"5\" style=\"color:#9da4b3\">' + esc(torRotateFailed)")
  })

  it('keeps the direct route visible and lets the user cancel a slow Tor bootstrap', () => {
    const source = readFileSync(join(root, 'apps/shell/src/main/index.ts'), 'utf8')
    expect(source).toContain("s.status === 'starting')")
    expect(source).toContain('torCancelStartingLabel')
    expect(source).toContain("s.active || s.status === 'starting'")
  })
})
