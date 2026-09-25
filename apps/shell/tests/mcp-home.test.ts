import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

describe('embedded MCP catalog', () => {
  it('materializes only runnable servers enabled, with toggle file and managed patch', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    const state = ensureEmbeddedMcpConfig(home)
    const config = JSON.parse(readFileSync(state.configPath, 'utf8')) as {
      servers: Array<{ id: string, enabled: boolean, args?: string[], serverName?: string, command?: string }>
    }
    const patch = readFileSync(state.patchPath, 'utf8')

    // Engram resolves via bare PATH command (fail-open): it starts enabled.
    // free-search has no runnable vendored binary in this checkout, so it
    // stays off. A dead command must never be registered enabled (it would
    // only burn the reconnect budget). No Serena row remains.
    expect(config.servers.map((server) => server.id)).toEqual([
      'engram',
      'free-search',
    ])
    expect(config.servers).toHaveLength(2)
    expect(config.servers.find((server) => server.id === 'engram')?.enabled).toBe(true)
    expect(config.servers.find((server) => server.id === 'free-search')?.enabled).toBe(false)
    expect(state.enabled).toEqual(['engram'])
    expect(config.servers.find((server) => server.id === 'engram')?.args).toEqual(['mcp'])
    expect(config.servers.find((server) => server.id === 'engram')?.command).toBe('engram')
    expect(patch).toContain('id: "freecode-mcp-engram"')
    expect(patch).not.toContain('serena')
    expect(patch).not.toContain('SERENA')
    expect(new Set(config.servers.map((server) => server.serverName)).size).toBe(2)
    expect(patch.match(new RegExp(MCP_MANAGED_PATCH_BEGIN, 'g'))).toHaveLength(1)
    expect(patch.match(new RegExp(MCP_MANAGED_PATCH_END, 'g'))).toHaveLength(1)
    expect(patch.match(/name: "@deepseek-ai\/dsh-mcp-client"/g)).toHaveLength(2)
  })

  it('preserves user overlay rows and applies a user toggle on the next boot', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    const first = ensureEmbeddedMcpConfig(home)
    writeFileSync(first.patchPath, `${readFileSync(first.patchPath, 'utf8')}\n- id: user-overlay\n  disabled: false\n`)
    const config = JSON.parse(readFileSync(first.configPath, 'utf8')) as { servers: Array<{ id: string, enabled: boolean }> }
    config.servers.find((server) => server.id === 'engram')!.enabled = false
    writeFileSync(first.configPath, `${JSON.stringify(config, null, 2)}\n`)

    const second = ensureEmbeddedMcpConfig(home)
    const patch = readFileSync(second.patchPath, 'utf8')
    expect(patch).toContain('user-overlay')
    expect(patch).toContain('id: "freecode-mcp-engram"')
    // The persisted engram toggle applies to engram's own row (disabled:
    // true). Match within the row: the free-search row follows and must not
    // satisfy this assertion by accident.
    expect(patch).toMatch(/id: "freecode-mcp-engram"\n  name: "@deepseek-ai\/dsh-mcp-client"\n  disabled: true\n/)
    expect(patch.match(new RegExp(MCP_MANAGED_PATCH_BEGIN, 'g'))).toHaveLength(1)
  })

  it('projects persisted toggles into the Standard preset environment', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    const state = setEmbeddedMcpEnabled(home, 'engram', false)
    expect(embeddedMcpEnvironment(state)).toMatchObject({
      FREECODE_WEB_MODE: '1',
      FREECODE_MCP_ENGRAM_ENABLED: 'false',
      // free-search has no runnable binary in this checkout, so it stays off.
      FREECODE_MCP_FREE_SEARCH_ENABLED: 'false',
    })
  })

  it('preserves the vendored executable path across toggles', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    // When no uvxCommand is provided, the vendored
    // free-search-mcp.exe path is used. A toggle should preserve it.
    const first = ensureEmbeddedMcpConfig(home)
    const firstConfig = JSON.parse(readFileSync(first.configPath, 'utf8')) as { servers: Array<{ id: string, command: string }> }
    // The command is the vendored path resolved by resolveVendoredMcpExe
    const firstCmd = firstConfig.servers.find((server) => server.id === 'free-search')?.command
    expect(firstCmd).toBeDefined()

    const second = setEmbeddedMcpEnabled(home, 'free-search', false)
    const secondConfig = JSON.parse(readFileSync(second.configPath, 'utf8')) as { servers: Array<{ id: string, command: string, enabled: boolean }> }
    const search = secondConfig.servers.find((server) => server.id === 'free-search')!
    expect(search.command).toBe(firstCmd)
    expect(search.enabled).toBe(false)
  })

  it('keeps the engram row fail-open with reconnect budget', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    const state = ensureEmbeddedMcpConfig(home)
    const patch = readFileSync(state.patchPath, 'utf8')
    // fail-open startup + bounded reconnect budget on the engram row.
    expect(patch).toMatch(/id: "freecode-mcp-engram"[\s\S]*?failOnStartupError: false/)
    expect(patch).toMatch(/id: "freecode-mcp-engram"[\s\S]*?maxAttempts: 10/)
    // The free-search row keeps its base shape (empty args)
    // even while the server stays disabled for lack of a binary.
    const config = JSON.parse(readFileSync(state.configPath, 'utf8')) as {
      servers: Array<{ id: string, command: string, args: string[] }>
    }
    expect(config.servers.find((server) => server.id === 'free-search')!.args).toEqual([])
  })

  it('contains no serena references anywhere in the managed catalog', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    const state = ensureEmbeddedMcpConfig(home)
    const configText = readFileSync(state.configPath, 'utf8')
    const patch = readFileSync(state.patchPath, 'utf8')
    for (const text of [configText, patch]) {
      expect(text.toLowerCase()).not.toContain('serena')
    }
    expect(embeddedMcpEnvironment(state)).not.toHaveProperty('FREECODE_MCP_SERENA_ENABLED')
  })
})
