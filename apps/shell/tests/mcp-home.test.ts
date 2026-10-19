import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ensureEmbeddedMcpConfig,
  embeddedMcpEnvironment,
  setEmbeddedMcpEnabled,
  MCP_MANAGED_PATCH_BEGIN,
  MCP_MANAGED_PATCH_END,
} from '../src/main/mcp-home.js'

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
  homes.push(dir)
  return dir
}

describe('embedded MCP catalog', () => {
  it('materializes only the free-search row, disabled when its binary is absent', () => {
    const state = ensureEmbeddedMcpConfig(home())
    const config = JSON.parse(readFileSync(state.configPath, 'utf8')) as {
      servers: Array<{ id: string, enabled: boolean, args?: string[] }>
    }
    const patch = readFileSync(state.patchPath, 'utf8')

    // free-search has no runnable vendored binary in this checkout, so it
    // stays off. A dead command must never be registered enabled (it would
    // only burn the reconnect budget). No Engram or Serena row remains.
    expect(config.servers.map((server) => server.id)).toEqual(['free-search'])
    expect(config.servers[0]?.enabled).toBe(false)
    expect(state.enabled).toEqual([])
    expect(patch).toContain('id: "freecode-mcp-free-search"')
    expect(patch.toLowerCase()).not.toContain('engram')
    expect(patch.toLowerCase()).not.toContain('serena')
    expect(patch.match(new RegExp(MCP_MANAGED_PATCH_BEGIN, 'g'))).toHaveLength(1)
    expect(patch.match(new RegExp(MCP_MANAGED_PATCH_END, 'g'))).toHaveLength(1)
    expect(patch.match(/name: "@deepseek-ai\/dsh-mcp-client"/g)).toHaveLength(1)
  })

  it('drops an engram row persisted by an older build', () => {
    const dir = home()
    mkdirSync(join(dir, 'mcp'), { recursive: true })
    writeFileSync(join(dir, 'mcp', 'servers.json'), JSON.stringify({
      version: 1,
      servers: [
        { id: 'engram', enabled: true, command: 'engram', args: ['mcp'] },
        { id: 'free-search', enabled: false },
      ],
    }))
    const state = ensureEmbeddedMcpConfig(dir)
    const configText = readFileSync(state.configPath, 'utf8')
    const patch = readFileSync(state.patchPath, 'utf8')
    for (const text of [configText, patch]) expect(text.toLowerCase()).not.toContain('engram')
    expect(embeddedMcpEnvironment(state)).not.toHaveProperty('FREECODE_MCP_ENGRAM_ENABLED')
  })

  it('preserves user overlay rows across boots', () => {
    const dir = home()
    const first = ensureEmbeddedMcpConfig(dir)
    writeFileSync(first.patchPath, `${readFileSync(first.patchPath, 'utf8')}\n- id: user-overlay\n  disabled: false\n`)
    const second = ensureEmbeddedMcpConfig(dir)
    const patch = readFileSync(second.patchPath, 'utf8')
    expect(patch).toContain('user-overlay')
    expect(patch.match(new RegExp(MCP_MANAGED_PATCH_BEGIN, 'g'))).toHaveLength(1)
  })

  it('projects persisted toggles into the Standard preset environment', () => {
    const state = setEmbeddedMcpEnabled(home(), 'free-search', false)
    expect(embeddedMcpEnvironment(state)).toEqual({
      FREECODE_WEB_MODE: '1',
      FREECODE_MCP_FREE_SEARCH_ENABLED: 'false',
    })
  })

  it('preserves the vendored executable path across toggles', () => {
    const dir = home()
    const first = ensureEmbeddedMcpConfig(dir)
    const firstConfig = JSON.parse(readFileSync(first.configPath, 'utf8')) as { servers: Array<{ id: string, command: string }> }
    const firstCmd = firstConfig.servers.find((server) => server.id === 'free-search')?.command
    expect(firstCmd).toBeDefined()

    const second = setEmbeddedMcpEnabled(dir, 'free-search', false)
    const secondConfig = JSON.parse(readFileSync(second.configPath, 'utf8')) as { servers: Array<{ id: string, command: string, enabled: boolean }> }
    const search = secondConfig.servers.find((server) => server.id === 'free-search')!
    expect(search.command).toBe(firstCmd)
    expect(search.enabled).toBe(false)
  })

  it('keeps the free-search row fail-open with reconnect budget', () => {
    const state = ensureEmbeddedMcpConfig(home())
    const patch = readFileSync(state.patchPath, 'utf8')
    expect(patch).toMatch(/id: "freecode-mcp-free-search"[\s\S]*?failOnStartupError: false/)
    expect(patch).toMatch(/id: "freecode-mcp-free-search"[\s\S]*?maxAttempts: 10/)
    const config = JSON.parse(readFileSync(state.configPath, 'utf8')) as {
      servers: Array<{ id: string, args: string[] }>
    }
    expect(config.servers.find((server) => server.id === 'free-search')!.args).toEqual([])
  })
})
