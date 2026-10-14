import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyTorRuntimeAssets } from '../../../scripts/tor-runtime-assets.mjs'

describe('Tor packaged runtime assets', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
    root = ''
  })

  function fixture(): { resources: string; torDigest: string } {
    root = mkdtempSync(join(tmpdir(), 'tor-runtime-assets-'))
    const resources = join(root, 'resources')
    const tor = join(resources, 'tor')
    mkdirSync(tor, { recursive: true })
    const executable = Buffer.from('verified Tor executable fixture')
    writeFileSync(join(tor, 'tor.exe'), executable)
    writeFileSync(join(tor, 'geoip'), Buffer.from('geoip data'))
    writeFileSync(join(tor, 'geoip6'), Buffer.from('geoip6 data'))
    return { resources, torDigest: createHash('sha256').update(executable).digest('hex') }
  }

  it('accepts the Tor executable only when it matches the pinned runtime manifest and both GeoIP databases ship', () => {
    const { resources, torDigest } = fixture()

    expect(verifyTorRuntimeAssets(resources, torDigest)).toMatchObject({
      executable: join(resources, 'tor', 'tor.exe'),
      geoipFiles: [join(resources, 'tor', 'geoip'), join(resources, 'tor', 'geoip6')],
      sha256: torDigest,
    })
  })

  it('rejects a missing Tor executable before an installer can ship without its manager', () => {
    const { resources, torDigest } = fixture()
    rmSync(join(resources, 'tor', 'tor.exe'))

    expect(() => verifyTorRuntimeAssets(resources, torDigest)).toThrow(/missing.*tor\.exe/i)
  })

  it('rejects stale or incomplete bundled Tor assets instead of silently degrading to direct-only', () => {
    const { resources } = fixture()

    expect(() => verifyTorRuntimeAssets(resources, '0'.repeat(64))).toThrow(/sha-256.*mismatch/i)
    writeFileSync(join(resources, 'tor', 'tor.exe'), 'pinned bytes')
    rmSync(join(resources, 'tor', 'geoip6'))
    const currentDigest = createHash('sha256').update('pinned bytes').digest('hex')
    expect(() => verifyTorRuntimeAssets(resources, currentDigest)).toThrow(/missing.*geoip6/i)
  })

  it('rejects zero-byte resources and directories masquerading as required files', () => {
    const { resources, torDigest } = fixture()
    writeFileSync(join(resources, 'tor', 'geoip'), '')
    expect(() => verifyTorRuntimeAssets(resources, torDigest)).toThrow(/missing.*geoip/i)

    rmSync(join(resources, 'tor', 'geoip'), { force: true })
    mkdirSync(join(resources, 'tor', 'geoip'))
    expect(() => verifyTorRuntimeAssets(resources, torDigest)).toThrow(/missing.*geoip/i)
  })
})
