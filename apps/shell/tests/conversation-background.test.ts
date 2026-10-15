import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { removeRendererProfile } from '../../../scripts/conversation-render-cleanup.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const verifierPath = join(repoRoot, 'scripts/verify-conversation-bundle.mjs')
const patchPath = join(repoRoot, 'patches/upstream/171-freecode-hermes-activity-background.patch')
const patchManifestPath = join(repoRoot, 'patches/upstream/upstream-patches.json')
const runtimePackagerPath = join(repoRoot, 'scripts/package-runtime.sh')
const shellPackagePath = join(repoRoot, 'apps/shell/package.json')

describe('Hermes conversation activity background', () => {
  it('retries transient Windows profile locks with a bounded backoff', async () => {
    const attempts: number[] = []
    const delays: number[] = []
    await removeRendererProfile(join(tmpdir(), 'freecode-conversation-normal-test123'), {
      remove: () => {
        attempts.push(attempts.length + 1)
        if (attempts.length < 3) throw Object.assign(new Error('profile still in use'), { code: 'EPERM' })
      },
      wait: async (milliseconds: number) => { delays.push(milliseconds) },
      retryDelayMs: 25,
    })

    expect(attempts).toHaveLength(3)
    expect(delays).toEqual([25, 50])
  })

  it('stops retrying a persistent transient lock at the configured bound', async () => {
    let attempts = 0
    const delays: number[] = []

    await expect(removeRendererProfile(join(tmpdir(), 'freecode-conversation-reduced-stuck123'), {
      remove: () => {
        attempts += 1
        throw Object.assign(new Error('profile still in use'), { code: 'EPERM' })
      },
      wait: async (milliseconds: number) => { delays.push(milliseconds) },
      maxRetries: 2,
      retryDelayMs: 10,
    })).rejects.toMatchObject({ code: 'EPERM' })

    expect(attempts).toBe(3)
    expect(delays).toEqual([10, 20])
  })

  it('does not retry permanent cleanup errors or delete outside renderer-owned profiles', async () => {
    const remove = vi.fn(() => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) })
    const wait = vi.fn(async () => {})

    await expect(removeRendererProfile(join(tmpdir(), 'freecode-conversation-normal-permanent123'), { remove, wait }))
      .rejects.toMatchObject({ code: 'EACCES' })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()

    await expect(removeRendererProfile(join(tmpdir(), 'not-a-renderer-profile'), { remove, wait }))
      .rejects.toThrow(/refusing to clean outside an owned renderer profile/u)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('registers the effect as a FreeCode-owned vendor overlay', () => {
    const manifest = JSON.parse(readFileSync(patchManifestPath, 'utf8')) as {
      patches: Array<{ file: string; order: number; owner: string; vendorOnly: boolean; contractTests: string[] }>
    }
    const entry = manifest.patches.find(({ file }) => file === '171-freecode-hermes-activity-background.patch')

    expect(entry).toMatchObject({
      order: 171,
      owner: 'freecode',
      vendorOnly: true,
      contractTests: expect.arrayContaining(['apps/shell/tests/conversation-background.test.ts']),
    })
  })

  it('rejects unrelated generic animation and gradient CSS as a false positive', () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), 'freecode-conversation-bundle-'))
    try {
      const bundlePath = join(scratchRoot, 'packages/client/ui-conversation/lib/client.js')
      mkdirSync(dirname(bundlePath), { recursive: true })
      writeFileSync(
        bundlePath,
        '.hero{animation:spin 1s linear infinite;background:radial-gradient(blue,transparent)}@keyframes spin{to{transform:rotate(1turn)}}',
      )

      const result = spawnSync(process.execPath, [verifierPath, scratchRoot], {
        cwd: repoRoot,
        encoding: 'utf8',
        windowsHide: true,
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain('Hermes synapse')
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true })
    }
  })

  it('round-trips the real Hermes overlay, including new files, without drift', () => {
    const scratchRoot=mkdtempSync(join(tmpdir(),'freecode-conversation-patch-'))
    try {
      const patch=readFileSync(patchPath,'utf8')
      const paths=[...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m=>m[1]!)
      for(const path of paths) {
        const target=join(scratchRoot,path);mkdirSync(dirname(target),{recursive:true})
        writeFileSync(target,readFileSync(join(repoRoot,path),'utf8').replaceAll('\r\n','\n'))
      }
      // Overlay 172 tightens the patterns' indexed access. Reverse that
      // successor before checking the historical creation patch, then replay
      // both; a standalone reverse of 171 must reject the evolved source.
      const strictPatch = join(repoRoot, 'patches/upstream/172-freecode-client-host-contracts.patch')
      const patternOnly = '--include=vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/phoenixPatterns.ts'
      const commands = [
        { patch: strictPatch, flags: ['--reverse', patternOnly] },
        { patch: patchPath, flags: ['--reverse'] },
        { patch: patchPath, flags: [] },
        { patch: patchPath, flags: ['--reverse', '--check'] },
        { patch: strictPatch, flags: [patternOnly] },
        { patch: strictPatch, flags: ['--reverse', '--check', patternOnly] },
      ]
      for(const {patch, flags} of commands) {
        const result=spawnSync('git',['-c','core.autocrlf=false','apply',...flags,patch],{cwd:scratchRoot,encoding:'utf8',windowsHide:true})
        expect(result.status,result.stderr).toBe(0)
      }
      for(const path of paths) expect(readFileSync(join(scratchRoot,path),'utf8')).toBe(readFileSync(join(repoRoot,path),'utf8').replaceAll('\r\n','\n'))
    } finally { rmSync(scratchRoot,{recursive:true,force:true}) }
  })

  it('accepts the actual emitted panel but rejects a disconnected working flag and missing license', () => {
    const source=readFileSync(join(repoRoot,'vendor/deepseek-harness/packages/client/ui-conversation/lib/client.js'),'utf8')
    const scratch=mkdtempSync(join(tmpdir(),'freecode-conversation-bundle-'))
    try {
      const path=join(scratch,'packages/client/ui-conversation/lib/client.js');mkdirSync(dirname(path),{recursive:true})
      for(const [label,bytes,expected] of [
        ['real',source,0],
        ['disconnected',source.replace('working: session?.running === true','working: false'),1],
        ['license',source.replaceAll('github.com/fathah','removed-attribution'),1],
      ] as const) {
        writeFileSync(path,bytes)
        const result=spawnSync(process.execPath,[verifierPath,scratch],{cwd:repoRoot,encoding:'utf8',windowsHide:true})
        expect(result.status,label+' '+result.stderr).toBe(expected)
      }
    } finally {rmSync(scratch,{recursive:true,force:true})}
  })

  it('verifies the materialized stage and copied runtime, not only the vendor source', () => {
    const script = readFileSync(runtimePackagerPath, 'utf8')
    const materialize = script.indexOf('materialize-runtime.mjs')
    const verifyStage = script.indexOf('verify-conversation-bundle.mjs" "$STAGE"')
    const copyStage = script.indexOf('copy-runtime-stage.mjs" "$STAGE" "$OUT/dsh"')
    const verifyCopied = script.indexOf('verify-conversation-bundle.mjs" "$OUT/dsh"')

    expect(materialize).toBeGreaterThan(-1)
    expect(verifyStage).toBeGreaterThan(materialize)
    expect(copyStage).toBeGreaterThan(verifyStage)
    expect(verifyCopied).toBeGreaterThan(copyStage)
  })

  it('rejects a stale embedded conversation bundle before electron-builder packages it', () => {
    const pkg = JSON.parse(readFileSync(shellPackagePath, 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['prepackage:verify']).toContain(
      'verify-conversation-bundle.mjs resources/freecode/dsh',
    )
  })

  it('requires timed Chromium rendering of the staged production panel before packaging', () => {
    const pkg = JSON.parse(readFileSync(shellPackagePath, 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['prepackage:verify']).toContain(
      'verify-conversation-render.mjs resources/freecode/dsh',
    )
  })
})
