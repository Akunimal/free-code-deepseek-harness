import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { removeRendererProfile } from '../../../scripts/conversation-render-cleanup.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const verifierPath = join(repoRoot, 'scripts/verify-conversation-bundle.mjs')
const patchPath = join(repoRoot, 'patches/upstream/167-freecode-conversation-ambient-background.patch')
const patchManifestPath = join(repoRoot, 'patches/upstream/upstream-patches.json')
const runtimePackagerPath = join(repoRoot, 'scripts/package-runtime.sh')
const shellPackagePath = join(repoRoot, 'apps/shell/package.json')
const sourcePath = join(
  repoRoot,
  'vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css',
)

describe('conversation ambient background', () => {
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
    const entry = manifest.patches.find(({ file }) => file === '167-freecode-conversation-ambient-background.patch')

    expect(entry).toMatchObject({
      order: 167,
      owner: 'freecode',
      vendorOnly: true,
      contractTests: ['apps/shell/tests/conversation-background.test.ts'],
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
      expect(`${result.stdout}\n${result.stderr}`).toContain('dsh-conversation-ambient-drift-a')
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true })
    }
  })

  it('replays the FreeCode patch and verifies both motion layers plus reduced-motion fallback', () => {
    expect(existsSync(patchPath), 'the ambient background must be a replayable FreeCode patch').toBe(true)
    if (!existsSync(patchPath)) return

    const scratchRoot = mkdtempSync(join(tmpdir(), 'freecode-conversation-patch-'))
    try {
      const cssPath = join(
        scratchRoot,
        'vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css',
      )
      mkdirSync(dirname(cssPath), { recursive: true })
      copyFileSync(sourcePath, cssPath)

      // Test replay from clean input even when the supported build pipeline
      // has already materialized the overlay in the working vendor tree.
      const reverse = spawnSync('git', ['-c', 'core.autocrlf=false', 'apply', '--reverse', '--check', patchPath], {
        cwd: scratchRoot, encoding: 'utf8', windowsHide: true,
      })
      if (reverse.status === 0) {
        const reverted = spawnSync('git', ['-c', 'core.autocrlf=false', 'apply', '--reverse', patchPath], {
          cwd: scratchRoot, encoding: 'utf8', windowsHide: true,
        })
        expect(reverted.status, `${reverted.stdout}\n${reverted.stderr}`).toBe(0)
      }

      const apply = spawnSync('git', ['-c', 'core.autocrlf=false', 'apply', '--check', patchPath], {
        cwd: scratchRoot,
        encoding: 'utf8',
        windowsHide: true,
      })
      expect(apply.status, `${apply.stdout}\n${apply.stderr}`).toBe(0)
      const applied = spawnSync('git', ['-c', 'core.autocrlf=false', 'apply', patchPath], {
        cwd: scratchRoot,
        encoding: 'utf8',
        windowsHide: true,
      })
      expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0)

      const css = readFileSync(cssPath, 'utf8')
      expect(css).toContain('isolation: isolate;')
      expect(css).toContain('pointer-events: none;')
      expect(css).toContain('@media (prefers-reduced-motion: reduce)')
      expect(css).toContain('animation: none;')
      expect(css).toContain('opacity: .90;')
      expect(css).toContain('opacity: .85;')
      expect(css).not.toContain('opacity: .22;')
      expect(css).toContain('translate3d(')
      expect(css).toContain('dsh-conversation-ambient-drift-a')
      expect(css).toContain('dsh-conversation-ambient-drift-b')

      const bundlePath = join(scratchRoot, 'packages/client/ui-conversation/lib/client.js')
      mkdirSync(dirname(bundlePath), { recursive: true })
      const emittedCss = [
        '.ConversationRoot_root{isolation:isolate}',
        '.ConversationRoot_root:before,.ConversationRoot_root:after{z-index:0;pointer-events:none}',
        '.ConversationRoot_root>*{z-index:1}',
        '.ConversationRoot_root:before{background:radial-gradient(color-mix(in srgb,blue 40%,transparent) 0%,transparent);opacity:.9;animation:10s ease-in-out infinite alternate NSS-DW_dsh-conversation-ambient-drift-a}',
        '.ConversationRoot_root:after{background:radial-gradient(color-mix(in srgb,blue 30%,transparent) 0%,transparent);opacity:.85;animation:10s ease-in-out infinite alternate NSS-DW_dsh-conversation-ambient-drift-b}',
        '@media (prefers-reduced-motion:reduce){.ConversationRoot_root:before,.ConversationRoot_root:after{animation:none;transform:none}}',
        '@keyframes NSS-DW_dsh-conversation-ambient-drift-a{0%{transform:translate(-9%,-5%)scale(1)}to{transform:translate(9%,5%)scale(1.16)}}',
        '@keyframes NSS-DW_dsh-conversation-ambient-drift-b{0%{transform:translate(8%,6%)scale(1.14)}to{transform:translate(-8%,-6%)scale(1)}}',
      ].join('')
      writeFileSync(
        bundlePath,
        `//#region ConversationRoot.module.css.mjs\nconst css$0 = ${JSON.stringify(emittedCss)};\n//#endregion\n`,
      )
      const verify = spawnSync(process.execPath, [verifierPath, scratchRoot], {
        cwd: repoRoot,
        encoding: 'utf8',
        windowsHide: true,
      })
      expect(verify.status, `${verify.stdout}\n${verify.stderr}`).toBe(0)
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true })
    }
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

  it('requires timed Chromium rendering of the staged production CSS before packaging', () => {
    const pkg = JSON.parse(readFileSync(shellPackagePath, 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['prepackage:verify']).toContain(
      'verify-conversation-render.mjs resources/freecode/dsh',
    )
  })
})
