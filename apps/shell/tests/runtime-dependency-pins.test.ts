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

  it('updates only the shipped DSH version/hash pin', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-'))
    mkdirSync(join(root, 'dsh', 'apps', 'cli', 'lib'), { recursive: true })
    const dshBytes = Buffer.from('built dsh cli fixture')
    writeFileSync(join(root, 'dsh', 'apps', 'cli', 'lib', 'bin.js'), dshBytes)
    writeFileSync(join(root, 'dsh', 'apps', 'cli', 'package.json'), JSON.stringify({ version: '0.2.1-alpha.1' }))

    const manifest: RuntimeManifest = {
      dependencies: [
        { id: 'helper-tool', path: 'helper-tool/helper-tool.exe', version: '1.0.0', sha256: 'a'.repeat(64) },
        { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true, version: '0.1.3-alpha.1', sha256: '1'.repeat(64) },
      ],
    }

    const result = refreshRuntimeDependencyPins(manifest, root) as RuntimeManifest

    expect(result.dependencies.find((dependency) => dependency.id === 'helper-tool')).toEqual(manifest.dependencies[0])
    expect(result.dependencies.find((dependency) => dependency.id === 'dsh-cli')).toMatchObject({
      version: '0.2.1-alpha.1',
      sha256: createHash('sha256').update(dshBytes).digest('hex'),
    })
    expect(manifest.dependencies.find((dependency) => dependency.id === 'dsh-cli')?.sha256).toBe('1'.repeat(64))
  })

  it('fails closed when the dsh-cli artifact is missing', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-missing-'))
    expect(() => refreshRuntimeDependencyPins({ dependencies: [
      { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true },
    ] } satisfies RuntimeManifest, root)).toThrow(/dsh-cli artifact/i)
  })

  it('rejects retired gateway entries instead of refreshing them', () => {
    root = mkdtempSync(join(tmpdir(), 'runtime-dependency-pins-retired-'))
    for (const retired of [
      { id: 'phoenix', path: 'phoenix/freellmpool-win-x64.exe', required: true },
      { id: 'opencode2api', path: 'opencode2api/opencode2api-win-x64.exe', required: true },
    ]) {
      expect(() => refreshRuntimeDependencyPins({ dependencies: [
        retired,
        { id: 'dsh-cli', path: 'dsh/apps/cli/lib/bin.js', required: true },
      ] } satisfies RuntimeManifest, root)).toThrow(/retired gateway/i)
    }
  })

  it('refreshes the integrity lock automatically after the staged runtime is copied', () => {
    const packageScript = readFileSync(new URL('../../../scripts/package-runtime.sh', import.meta.url), 'utf8')
    expect(packageScript).toContain('refresh-runtime-dependency-pins.mjs')
    expect(packageScript).not.toContain('freellmpool-staging.mjs')
    expect(packageScript).not.toContain('opencode2api-staging.mjs')
    expect(packageScript).not.toMatch(/remove_tree[^\n]*opencode2api/)
    expect(packageScript).toContain('vendor_pnpm --dir "$STAGE" install')
  })

  it('does not declare OpenCode2API or Phoenix as runtime dependencies', () => {
    const manifest = JSON.parse(readFileSync(new URL('../resources/runtime-deps.json', import.meta.url), 'utf8')) as RuntimeManifest
    expect(manifest.dependencies.some((dependency) => dependency.id === 'opencode2api'
      || dependency.id === 'phoenix'
      || /opencode2api|freellmpool/i.test(dependency.path ?? ''))).toBe(false)
  })
})
