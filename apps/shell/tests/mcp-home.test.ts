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
      servers: Array<{ id: string, enabled: boolean, args?: string[], serverName?: string }>
    }
    const patch = readFileSync(state.patchPath, 'utf8')

    // The repo payload vendors serena.exe but not free-search-mcp.exe: only
    // the runnable entry starts enabled. A dead command must never be
    // registered enabled (it would only burn the reconnect budget).
    expect(state.enabled).toEqual(['serena'])
    expect(config.servers.map((server) => server.id)).toEqual([
      'serena',
      'free-search',
    ])
    expect(config.servers).toHaveLength(2)
    expect(config.servers.find((server) => server.id === 'serena')?.enabled).toBe(true)
    expect(config.servers.find((server) => server.id === 'free-search')?.enabled).toBe(false)
    // When no uvxCommand/serenaLauncherPath is provided and the vendored
    // serena.exe exists, args are the bare server args (no --from uvx prefix).
    expect(config.servers.find((server) => server.id === 'serena')?.args).toEqual([
      'start-mcp-server',
      '--context',
      'claude-code',
    ])
    expect(config.servers.find((server) => server.id === 'serena')).toMatchObject({
      projectActivation: { toolName: 'activate_project', pathArgument: 'project' },
    })
    expect(patch).toMatch(/id: "freecode-mcp-serena"[\s\S]*?projectActivation:[\s\S]*?toolName: "activate_project"[\s\S]*?pathArgument: "project"/)
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
    config.servers.find((server) => server.id === 'serena')!.enabled = false
    writeFileSync(first.configPath, `${JSON.stringify(config, null, 2)}\n`)

    const second = ensureEmbeddedMcpConfig(home)
    const patch = readFileSync(second.patchPath, 'utf8')
    expect(patch).toContain('user-overlay')
    expect(patch).toContain('id: "freecode-mcp-serena"')
    // The persisted serena toggle applies to serena's own row (disabled:
    // true). Match within the row: the free-search row follows and must not
    // satisfy this assertion by accident.
    expect(patch).toMatch(/id: "freecode-mcp-serena"\n  name: "@deepseek-ai\/dsh-mcp-client"\n  disabled: true\n/)
    expect(patch.match(new RegExp(MCP_MANAGED_PATCH_BEGIN, 'g'))).toHaveLength(1)
  })

  it('projects persisted toggles into the Standard preset environment', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    const state = setEmbeddedMcpEnabled(home, 'serena', false)
    expect(embeddedMcpEnvironment(state)).toMatchObject({
      FREECODE_WEB_MODE: '1',
      FREECODE_MCP_SERENA_ENABLED: 'false',
      // free-search has no runnable binary in this checkout, so it stays off.
      FREECODE_MCP_FREE_SEARCH_ENABLED: 'false',
    })
  })

  it('preserves the vendored executable path across toggles', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    // When no uvxCommand/serenaLauncherPath is provided, the vendored
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

  it('uses the packaged Serena launcher on Windows without changing other MCP rows', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    // The override applies only to a launcher file that really exists.
    const launcher = join(home, 'serena-headless-launcher.py')
    writeFileSync(launcher, '# fake launcher')
    const state = ensureEmbeddedMcpConfig(home, {
      uvxCommand: 'C:\\Tools\\uvx.exe',
      serenaLauncherPath: launcher,
    })
    const config = JSON.parse(readFileSync(state.configPath, 'utf8')) as {
      servers: Array<{ id: string, command: string, args: string[] }>
    }
    const serena = config.servers.find((server) => server.id === 'serena')!
    expect(serena.command).toBe('C:\\Tools\\uvx.exe')
    expect(serena.args).toEqual([
      '--from',
      'git+https://github.com/oraios/serena',
      'python',
      launcher,
      'start-mcp-server',
      '--context',
      'claude-code',
    ])
    // The free-search row keeps its base shape (empty args, no uvx prefix)
    // even while the server stays disabled for lack of a binary.
    expect(config.servers.find((server) => server.id === 'free-search')!.args).toEqual([])
  })

  it('ignores a missing Serena launcher and keeps the vendored server row', () => {
    const home = mkdtempSync(join(tmpdir(), 'freecode-mcp-home-'))
    homes.push(home)
    const state = ensureEmbeddedMcpConfig(home, {
      uvxCommand: 'C:\\Tools\\uvx.exe',
      serenaLauncherPath: join(home, 'does-not-exist.py'),
    })
    const config = JSON.parse(readFileSync(state.configPath, 'utf8')) as {
      servers: Array<{ id: string, command: string, args: string[] }>
    }
    const serena = config.servers.find((server) => server.id === 'serena')!
    // No uvx prefix: the bare vendored server args survive.
    expect(serena.args).toEqual(['start-mcp-server', '--context', 'claude-code'])
    expect(serena.command).not.toBe('C:\\Tools\\uvx.exe')
  })
})
