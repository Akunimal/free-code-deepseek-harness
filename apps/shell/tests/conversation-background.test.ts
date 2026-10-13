import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const verifierPath = join(repoRoot, 'scripts/verify-conversation-bundle.mjs')
const patchPath = join(repoRoot, 'patches/upstream/167-freecode-conversation-ambient-background.patch')
const patchManifestPath = join(repoRoot, 'patches/upstream/upstream-patches.json')
const sourcePath = join(
  repoRoot,
  'vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css',
)

describe('conversation ambient background', () => {
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
      expect(css).toContain('opacity: .22;')
      expect(css).toContain('translate3d(')
      expect(css).toContain('dsh-conversation-ambient-drift-a')
      expect(css).toContain('dsh-conversation-ambient-drift-b')

      const bundlePath = join(scratchRoot, 'packages/client/ui-conversation/lib/client.js')
      mkdirSync(dirname(bundlePath), { recursive: true })
      writeFileSync(bundlePath, css)
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
})
