import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverTsdownWorkspacePackages } from './tsdown-workspace.mjs'

const root = resolve(import.meta.dirname, '..')
const clientPatterns = ['vendor/*', 'packages/*/*', 'apps/cli']
const hostPatterns = [...clientPatterns, 'apps/desktop-host']

describe('tsdown workspace discovery', () => {
  it('includes only matching directories that own a package manifest', () => {
    for (const directory of discoverTsdownWorkspacePackages(root, hostPatterns)) {
      expect(existsSync(join(root, directory, 'package.json')), directory).toBe(true)
    }
  })

  it('omits generated Graphify folders without excluding real client and host packages', () => {
    const client = discoverTsdownWorkspacePackages(root, clientPatterns)
    const host = discoverTsdownWorkspacePackages(root, hostPatterns)

    expect(client).not.toContain('packages/api/graphify-out')
    expect(client).not.toContain('packages/client/ui-conversation/graphify-out')
    expect(client).toContain('packages/client/ui-conversation')
    expect(host).toContain('apps/desktop-host')
    expect(client).not.toContain('apps/desktop-host')
  })
})
