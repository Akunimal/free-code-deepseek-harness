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

  it('updates only the built DSH version/hash pin from staged artifact metadata', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-'))
    mkdirSync(join(root, 'dsh', 'apps', 'cli', 'lib'), { recursive: true })
    const dshBytes = Buffer.from('built dsh cli fixture')
    writeFileSync(join(root, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), dshBytes)
    writeFileSync(join(root, 'dsh', 'apps', 'cli', 'package.json'), JSON.stringify({ version: '0.2.1-alpha.1' }))

    const manifest = {
      dependencies: [
        { id: 'tor', path: 'tor/tor.exe', version: '13.5.7', sha256: 'a'.repeat(64) },
        { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true, version: '0.1.3-alpha.1', sha256: '1'.repeat(64) },
      ],
    }

    const result = refreshRuntimeDependencyPins(manifest, root)

    expect(result.dependencies.find((dependency) => dependency.id === 'tor')).toEqual(manifest.dependencies[0])
    expect(result.dependencies.find((dependency) => dependency.id === 'dsh-cli')).toMatchObject({
      version: '0.2.1-alpha.1',
      sha256: createHash('sha256').update(dshBytes).digest('hex'),
    })
  })

  it('fails closed when the required built DSH artifact is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-missing-'))
    expect(() => refreshRuntimeDependencyPins({ dependencies: [
      { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true },
    ] }, root)).toThrow(/dsh-cli artifact/i)
  })

  it('refreshes the integrity lock automatically after the staged runtime is copied', () => {
    const packageScript = readFileSync(new URL('../../../scripts/package-runtime.sh', import.meta.url), 'utf8')
    expect(packageScript).toContain('refresh-runtime-dependency-pins.mjs')
  })
})
