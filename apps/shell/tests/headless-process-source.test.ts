import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  inspectProcessLaunchSource,
  verifyProcessLaunchInventory,
} from '../../../scripts/verify-process-launch-inventory.mjs'

describe('source process-launch headless contract', () => {
  it('fails closed for aliased ESM and CommonJS launch APIs without windowsHide', () => {
    const esm = inspectProcessLaunchSource(
      "import { spawn as launch } from 'node:child_process'\nlaunch('pwsh.exe', [])",
      'fixture/esm.ts',
    )
    const commonJs = inspectProcessLaunchSource(
      "const { execFile: run } = require('child_process')\nrun('git', ['status'])",
      'fixture/cjs.cjs',
    )

    expect(esm).toEqual([{ file: 'fixture/esm.ts', line: 2, api: 'spawn', policy: 'missing' }])
    expect(commonJs).toEqual([{ file: 'fixture/cjs.cjs', line: 2, api: 'execFile', policy: 'missing' }])
  })

  it('covers every Node child_process launch API and rejects a later hidden-policy override', () => {
    const invocations: Array<[string, string]> = [
      ['exec', "launch('pwsh.exe')"],
      ['execFile', "launch('git', ['status'])"],
      ['execFileSync', "launch('git', ['status'])"],
      ['execSync', "launch('pwsh.exe')"],
      ['fork', "launch('worker.js')"],
      ['spawn', "launch('pwsh.exe', [])"],
      ['spawnSync', "launch('pwsh.exe', [])"],
    ]

    for (const [api, invocation] of invocations) {
      const sites = inspectProcessLaunchSource(
        `import { ${api} as launch } from 'node:child_process'\n${invocation}`,
        `fixture/${api}.ts`,
      )
      expect(sites, api).toEqual([{ file: `fixture/${api}.ts`, line: 2, api, policy: 'missing' }])
    }

    expect(inspectProcessLaunchSource([
      "import { spawn } from 'node:child_process'",
      "const hidden = { windowsHide: true }",
      "spawn('pwsh.exe', [], { ...hidden, windowsHide: false })",
    ].join('\n'), 'fixture/override.ts')).toEqual([
      { file: 'fixture/override.ts', line: 3, api: 'spawn', policy: 'dynamic' },
    ])
  })

  it('recognizes namespace, dynamic-import, and object-constant hidden policies', () => {
    const source = [
      "import * as cp from 'node:child_process'",
      "const hidden = { windowsHide: true, stdio: 'ignore' }",
      "const { execFile: run } = await import('node:child_process')",
      "cp.spawn('pwsh.exe', [], hidden)",
      "run('git', ['status'], hidden)",
    ].join('\n')

    expect(inspectProcessLaunchSource(source, 'fixture/policies.ts')).toEqual([
      { file: 'fixture/policies.ts', line: 4, api: 'spawn', policy: 'hidden' },
      { file: 'fixture/policies.ts', line: 5, api: 'execFile', policy: 'hidden' },
    ])
  })

  it('accepts only the documented native GUI-launch policy exceptions', () => {
    const source = [
      "import { execFile } from 'node:child_process'",
      "execFile('xdg-open', [path], { windowsHide: window === 'hidden' })",
    ].join('\n')

    expect(inspectProcessLaunchSource(
      source,
      'vendor/deepseek-harness/packages/util/native-command/src/runner.ts',
    )).toEqual([{
      file: 'vendor/deepseek-harness/packages/util/native-command/src/runner.ts',
      line: 2,
      api: 'execFile',
      policy: 'visible-ui-exception',
    }])

    const gui = "import { spawn } from 'node:child_process'; spawn(command, args, { windowsHide: false })"
    expect(inspectProcessLaunchSource(gui, 'apps/shell/src/main/interactive-gui.ts')[0]?.policy).toBe('visible-ui-exception')
    expect(inspectProcessLaunchSource(gui, 'apps/shell/src/main/background.ts')[0]?.policy).toBe('dynamic')
  })

  it('audits all shipped application and package sources with no unreviewed console launch', () => {
    const result = verifyProcessLaunchInventory()

    expect(result.files).toBeGreaterThan(100)
    expect(result.launches).toBeGreaterThan(20)
    expect(result.visibleUiExceptions).toBe(3)
    expect(result.failures).toEqual([])
  })

  it('runs the source inventory as part of the package preflight', () => {
    const shellPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(shellPackage.scripts?.['prepackage:verify']).toContain('verify-process-launch-inventory.mjs')
  })
})
