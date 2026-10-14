import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { refreshRuntimeDependencyPins } from '../../../scripts/runtime-dependency-pins.mjs'

describe('runtime dependency pins', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
    root = ''
  })

  it('updates only built opencode2api and DSH version/hash pins from staged artifact metadata', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-'))
    mkdirSync(join(root, 'opencode2api'), { recursive: true })
    mkdirSync(join(root, 'dsh', 'apps', 'cli', 'lib'), { recursive: true })
    const opencodeBytes = Buffer.from('opencode2api v1.3.8 binary fixture')
    const dshBytes = Buffer.from('built dsh cli fixture')
    writeFileSync(join(root, 'opencode2api', 'opencode2api-win-x64.exe'), opencodeBytes)
    writeFileSync(join(root, 'opencode2api', 'freecode-build-receipt.json'), JSON.stringify({ version: 'v1.3.8' }))
    writeFileSync(join(root, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), dshBytes)
    writeFileSync(join(root, 'dsh', 'apps', 'cli', 'package.json'), JSON.stringify({ version: '0.2.1-alpha.1' }))

    const manifest = {
      dependencies: [
        { id: 'opencode2api', path: 'opencode2api/opencode2api-win-x64.exe', required: true, version: '1.3.5', sha256: '0'.repeat(64) },
        { id: 'tor', path: 'tor/tor.exe', version: '13.5.7', sha256: 'a'.repeat(64) },
        { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true, version: '0.1.3-alpha.1', sha256: '1'.repeat(64) },
      ],
    }

    const result = refreshRuntimeDependencyPins(manifest, root)

    expect(result.dependencies.find((dependency) => dependency.id === 'opencode2api')).toMatchObject({
      version: '1.3.8',
      sha256: createHash('sha256').update(opencodeBytes).digest('hex'),
    })
    expect(result.dependencies.find((dependency) => dependency.id === 'tor')).toEqual(manifest.dependencies[1])
    expect(result.dependencies.find((dependency) => dependency.id === 'dsh-cli')).toMatchObject({
      version: '0.2.1-alpha.1',
      sha256: createHash('sha256').update(dshBytes).digest('hex'),
    })
    expect(manifest.dependencies.find((dependency) => dependency.id === 'opencode2api')?.version).toBe('1.3.5')
  })

  it('fails closed when a required built artifact or its version receipt is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-missing-'))
    expect(() => refreshRuntimeDependencyPins({ dependencies: [
      { id: 'opencode2api', path: 'opencode2api/opencode2api-win-x64.exe', required: true },
      { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true },
    ] }, root)).toThrow(/opencode2api.*artifact/i)
  })

  it('refreshes the integrity lock automatically after the staged runtime is copied', () => {
    const packageScript = readFileSync(new URL('../../../scripts/package-runtime.sh', import.meta.url), 'utf8')
    expect(packageScript).toContain('refresh-runtime-dependency-pins.mjs')
  })
})
