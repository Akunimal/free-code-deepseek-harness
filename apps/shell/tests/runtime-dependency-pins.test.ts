import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { refreshRuntimeDependencyPins } from '../../../scripts/runtime-dependency-pins.mjs'

type RuntimeDependency = {
  id: string
  path: string
  required?: boolean
  version?: string
  sha256?: string
  network?: boolean
}

type RuntimeManifest = { dependencies: RuntimeDependency[] }

describe('runtime dependency pins', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
    root = ''
  })

  it('updates only the shipped Phoenix and DSH version/hash pins from receipts', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-'))
    mkdirSync(join(root, 'phoenix'), { recursive: true })
    mkdirSync(join(root, 'dsh', 'apps', 'cli', 'lib'), { recursive: true })
    const phoenixBytes = Buffer.from('FreeLLMpool Phoenix win-x64 fixture')
    const dshBytes = Buffer.from('built dsh cli fixture')
    writeFileSync(join(root, 'phoenix', 'freellmpool-win-x64.exe'), phoenixBytes)
    writeFileSync(join(root, 'phoenix', 'freecode-build-receipt.json'), JSON.stringify({
      schemaVersion: 1,
      upstream: { version: '0.13.0', commit: 'e4411650da95edf3002c6789ccd1c816aedae1d4' },
      binarySha256: createHash('sha256').update(phoenixBytes).digest('hex'),
    }))
    writeFileSync(join(root, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), dshBytes)
    writeFileSync(join(root, 'dsh', 'apps', 'cli', 'package.json'), JSON.stringify({ version: '0.2.1-alpha.1' }))

    const manifest: RuntimeManifest = {
      dependencies: [
        { id: 'phoenix', path: 'phoenix/freellmpool-win-x64.exe', required: true, version: '0.13.0', sha256: '0'.repeat(64) },
        { id: 'helper-tool', path: 'helper-tool/helper-tool.exe', version: '1.0.0', sha256: 'a'.repeat(64) },
        { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true, version: '0.1.3-alpha.1', sha256: '1'.repeat(64) },
      ],
    }

    const result = refreshRuntimeDependencyPins(manifest, root) as RuntimeManifest

    expect(result.dependencies.find((dependency) => dependency.id === 'phoenix')).toMatchObject({
      version: '0.13.0',
      sha256: createHash('sha256').update(phoenixBytes).digest('hex'),
    })
    expect(result.dependencies.find((dependency) => dependency.id === 'helper-tool')).toEqual(manifest.dependencies[1])
    expect(result.dependencies.find((dependency) => dependency.id === 'dsh-cli')).toMatchObject({
      version: '0.2.1-alpha.1',
      sha256: createHash('sha256').update(dshBytes).digest('hex'),
    })
    expect(manifest.dependencies.find((dependency) => dependency.id === 'phoenix')?.sha256).toBe('0'.repeat(64))
  })

  it('fails closed when Phoenix artifact or verified build receipt is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-missing-'))
    expect(() => refreshRuntimeDependencyPins({ dependencies: [
      { id: 'phoenix', path: 'phoenix/freellmpool-win-x64.exe', required: true },
      { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true },
    ] } satisfies RuntimeManifest, root)).toThrow(/Phoenix.*artifact/i)
  })

  it('refreshes the integrity lock automatically after the staged runtime is copied', () => {
    const packageScript = readFileSync(new URL('../../../scripts/package-runtime.sh', import.meta.url), 'utf8')
    expect(packageScript).toContain('refresh-runtime-dependency-pins.mjs')
    expect(packageScript).toContain('freellmpool-staging.mjs')
    expect(packageScript).not.toContain('opencode2api-staging.mjs')
  })

  it('does not declare OpenCode2API as a runtime dependency', () => {
    const manifest = JSON.parse(readFileSync(new URL('../resources/runtime-deps.json', import.meta.url), 'utf8')) as RuntimeManifest
    expect(manifest.dependencies.some((dependency) => dependency.id === 'opencode2api'
      || /opencode2api/i.test(dependency.path ?? ''))).toBe(false)
    expect(manifest.dependencies.find((dependency) => dependency.id === 'phoenix')).toMatchObject({
      required: true,
      path: 'phoenix/freellmpool-win-x64.exe',
      network: true,
    })
  })
})
