import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function source(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('headless child-process launch options', () => {
  it.each([
    ['apps/desktop/src/host-process.ts', /stdio:\s*\['ignore',\s*'pipe',\s*'pipe',\s*'ipc'\],[\s\S]{0,80}windowsHide:\s*true/u],
    ['apps/desktop/src/login-shell-environment.ts', /stdio:\s*\['ignore',\s*'pipe',\s*'ignore'\],[\s\S]{0,100}windowsHide:\s*true/u],
    ['packages/test-support/session-snapshot/src/launcher.ts', /stdio:\s*\['pipe',\s*'pipe',\s*'pipe'\],[\s\S]{0,80}windowsHide:\s*true/u],
    ['packages/test-support/session-snapshot/tests/fixtures/fake-acp-agent.ts', /stdio:\s*\['ignore',\s*'inherit',\s*'inherit'\],[\s\S]{0,80}windowsHide:\s*true/u],
    ['native/system/packages/entry/src/index.ts', /stdio:\s*\['ignore',\s*'pipe',\s*'ignore'\],[\s\S]{0,80}windowsHide:\s*true/u],
    ['scripts/run-gates.ts', /spawnSync\('powershell',\s*processTableArgs\('win32'\),\s*\{[^}]{0,160}windowsHide:\s*true/u],
  ])('sets windowsHide for %s', (path, launchOptions) => {
    expect(source(path)).toMatch(launchOptions)
  })

  it('hides the asynchronous Windows PowerShell process-table sampler', () => {
    expect(source('scripts/run-gates.ts'))
      .toMatch(/spawn\(command,\s*args,\s*\{[\s\S]{0,180}windowsHide:\s*platform\s*===\s*'win32'/u)
  })

  it('keeps the folder picker test dialog intentional while hiding its PowerShell console', () => {
    expect(source('packages/host/directory-picker-native/tests/win32-dialog.spec.ts'))
      .toMatch(/spawnSync\('powershell\.exe',[\s\S]{0,900}windowsHide:\s*true/u)
  })

  it('keeps the real Windows ACL PowerShell smoke hidden', () => {
    expect(source('packages/sandbox/sandbox-windows-acl/tests/runner.spec.ts'))
      .toMatch(/spawnSync\('pwsh',[\s\S]{0,500}windowsHide:\s*true/u)
  })

  it('keeps the persistent PowerShell host-facts probe hidden', () => {
    expect(source('packages/shell/tool-pwsh-persistent/tests/loader-composition.spec.ts'))
      .toMatch(/spawnSync\(\s*pwshPath,[\s\S]{0,260}windowsHide:\s*true/u)
  })

  it('keeps the credential-script PowerShell child hidden', () => {
    expect(source('apps/desktop/tests/upload-with-credentials.spec.ts'))
      .toMatch(/execute\('pwsh',[\s\S]{0,260}windowsHide:\s*true/u)
  })

  it('keeps gate process-tree cleanup hidden on Windows', () => {
    expect(source('scripts/run-gates.ts'))
      .toMatch(/spawnSync\('taskkill',[\s\S]{0,180}windowsHide:\s*true/u)
  })
})
