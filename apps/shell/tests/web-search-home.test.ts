import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { ensureEmbeddedMcpConfig, MCP_MANAGED_PATCH_BEGIN } from '../src/main/mcp-home.js'
import {
  WEB_SEARCH_PATCH_BEGIN,
  WEB_SEARCH_PATCH_END,
  ensureManagedWebSearch,
  freeLoopbackPort,
} from '../src/main/web-search-home.js'

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'freecode-web-search-'))
  homes.push(dir)
  return dir
}

/** A fake resources/freecode tree with the plugin, settings and python.exe present. */
function resources(root: string, parts: { plugin?: boolean, settings?: boolean, python?: boolean } = {}): string {
  const dir = join(root, 'resources', 'freecode')
  const { plugin = true, settings = true, python = true } = parts
  mkdirSync(join(dir, 'searxng-search'), { recursive: true })
  if (plugin) writeFileSync(join(dir, 'searxng-search', 'index.mjs'), 'export const name = "x"\n')
  if (settings) writeFileSync(join(dir, 'searxng-search', 'settings.yml'), 'use_default_settings: true\n')
  if (python) {
    mkdirSync(join(dir, 'searxng-runtime', 'python'), { recursive: true })
    writeFileSync(join(dir, 'searxng-runtime', 'python', 'python.exe'), '')
  }
  return dir
}

function options(home: string, res: string, extra: Partial<Parameters<typeof ensureManagedWebSearch>[0]> = {}) {
  return { homeDir: home, resourcesDir: res, platform: 'win32' as const, port: 48123, ...extra }
}

function patchOf(home: string): string {
  return readFileSync(join(home, 'cordis.patch.yml'), 'utf8')
}

function countBlocks(text: string): number {
  return text.split(WEB_SEARCH_PATCH_BEGIN).length - 1
}

function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? allFiles(path) : [path]
  })
}

describe('managed web search patch block', () => {
  it('first run writes searxng.json with enabled true and creates web-search/tmp', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const state = await ensureManagedWebSearch(options(home, resources(root)))
    expect(JSON.parse(readFileSync(state.configPath, 'utf8'))).toEqual({ version: 1, enabled: true })
    expect(existsSync(join(home, 'web-search', 'tmp'))).toBe(true)
    expect(state.active).toBe(true)
  })

  it('writes a block with a file URL, the loopback baseURL, and the row web override', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    await ensureManagedWebSearch(options(home, resources(root)))
    const patch = patchOf(home)
    expect(patch).toMatch(/name: "file:\/\/\/[^"]*searxng-search\/index\.mjs"/)
    expect(patch).toContain('baseURL: "http://127.0.0.1:48123"')
    expect(patch).toContain('searchProvider: searxng')
    expect(patch).toContain('fetchProvider: http')
  })

  it('leaves exactly one block across two runs, and a new port replaces the old one', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const res = resources(root)
    await ensureManagedWebSearch(options(home, res, { port: 11111 }))
    await ensureManagedWebSearch(options(home, res, { port: 22222 }))
    const patch = patchOf(home)
    expect(countBlocks(patch)).toBe(1)
    expect(patch).toContain('127.0.0.1:22222')
    expect(patch).not.toContain('127.0.0.1:11111')
  })

  it('keeps content outside the block, including the MCP block, and survives a later MCP refresh', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const res = resources(root)
    ensureEmbeddedMcpConfig(home)
    await ensureManagedWebSearch(options(home, res))
    let patch = patchOf(home)
    expect(patch).toContain(MCP_MANAGED_PATCH_BEGIN)
    expect(countBlocks(patch)).toBe(1)

    ensureEmbeddedMcpConfig(home)
    patch = patchOf(home)
    expect(patch).toContain(MCP_MANAGED_PATCH_BEGIN)
    expect(patch).toContain(WEB_SEARCH_PATCH_END)
    expect(countBlocks(patch)).toBe(1)
  })

  it('enabled false removes the block and gives active false; enabled true restores it', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const res = resources(root)
    await ensureManagedWebSearch(options(home, res))
    writeFileSync(join(home, 'web-search', 'searxng.json'), JSON.stringify({ version: 1, enabled: false }))
    const off = await ensureManagedWebSearch(options(home, res))
    expect(off.active).toBe(false)
    expect(patchOf(home)).not.toContain(WEB_SEARCH_PATCH_BEGIN)

    writeFileSync(join(home, 'web-search', 'searxng.json'), JSON.stringify({ version: 1, enabled: true }))
    const on = await ensureManagedWebSearch(options(home, res))
    expect(on.active).toBe(true)
    expect(patchOf(home)).toContain(WEB_SEARCH_PATCH_BEGIN)
  })

  it('a missing plugin file gives active false and no block', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const state = await ensureManagedWebSearch(options(home, resources(root, { plugin: false })))
    expect(state.active).toBe(false)
    expect(patchOf(home)).not.toContain(WEB_SEARCH_PATCH_BEGIN)
  })

  it('a missing python.exe gives active false and no block', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const state = await ensureManagedWebSearch(options(home, resources(root, { python: false })))
    expect(state.active).toBe(false)
    expect(patchOf(home)).not.toContain(WEB_SEARCH_PATCH_BEGIN)
  })

  it('platform linux gives active false and no block', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const state = await ensureManagedWebSearch(options(home, resources(root), { platform: 'linux' }))
    expect(state.active).toBe(false)
    expect(patchOf(home)).not.toContain(WEB_SEARCH_PATCH_BEGIN)
  })

  it('a patch of exactly [] plus the block parses as a YAML list, and removing the block leaves []', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const res = resources(root)
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'cordis.patch.yml'), '[]\n')
    await ensureManagedWebSearch(options(home, res))
    const parsed = parse(patchOf(home)) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)

    writeFileSync(join(home, 'web-search', 'searxng.json'), JSON.stringify({ version: 1, enabled: false }))
    await ensureManagedWebSearch(options(home, res))
    expect(patchOf(home)).toBe('[]\n')
  })

  it('corrupt searxng.json falls back to enabled without throwing', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    mkdirSync(join(home, 'web-search'), { recursive: true })
    writeFileSync(join(home, 'web-search', 'searxng.json'), '{not json')
    const state = await ensureManagedWebSearch(options(home, resources(root)))
    expect(state.enabled).toBe(true)
    expect(state.active).toBe(true)
  })

  it('a Windows path with spaces gives a valid percent-encoded file URL', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    const res = resources(join(root, 'Program Files', 'Free Code'))
    await ensureManagedWebSearch(options(home, res))
    const match = patchOf(home).match(/name: ("file:[^"]*")/)
    expect(match).not.toBeNull()
    const url = new URL(JSON.parse(match![1]!) as string)
    expect(url.protocol).toBe('file:')
    expect(url.pathname).toContain('%20')
    expect(url.pathname).toMatch(/searxng-search\/index\.mjs$/)
  })

  it('freeLoopbackPort returns a port from 1 to 65535', async () => {
    const port = await freeLoopbackPort()
    expect(Number.isInteger(port)).toBe(true)
    expect(port).toBeGreaterThanOrEqual(1)
    expect(port).toBeLessThanOrEqual(65535)
  })

  it('no file under the home contains the secret env name or a 64-hex value', async () => {
    const root = tempRoot()
    const home = join(root, 'dsh-home')
    await ensureManagedWebSearch(options(home, resources(root)))
    for (const file of allFiles(home)) {
      const text = readFileSync(file, 'utf8')
      expect(text).not.toContain('SEARXNG_SECRET')
      expect(text).not.toMatch(/[0-9a-f]{64}/)
    }
  })
})
