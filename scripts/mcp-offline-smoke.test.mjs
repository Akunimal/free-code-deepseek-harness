import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createReleaseGatePlan } from './release-gate-plan.mjs'
import { createReleaseSmokeEnvironment } from './release-smoke-environment.mjs'

test('release gate uses only the repository-owned MCP fixture smoke', () => {
  const plan = createReleaseGatePlan({ version: '0.9.3', outputDir: 'C:\\temp\\release' })
  const commandText = plan.map((step) => `${step.label} ${step.args.join(' ')}`).join('\n')

  assert.match(commandText, /mcp-offline-smoke\.mjs/)
  assert.doesNotMatch(commandText, /mcp-real-smoke|test:mcp:real|uvx|serena|free-search-mcp/)
})

test('release smoke environment has scratch-only profiles and no inherited secrets', () => {
  const smokeRoot = 'C:\\Temp\\freecode-smoke-123'
  const environment = createReleaseSmokeEnvironment({
    systemRoot: 'C:\\Windows',
    nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
    smokeRoot,
  })

  assert.deepEqual(Object.keys(environment).sort(), [
    'APPDATA', 'HOME', 'LOCALAPPDATA', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR',
  ].sort())
  for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) {
    assert.ok(environment[key].startsWith(smokeRoot), `${key} escaped the scratch directory`)
  }
  assert.equal(environment.SystemRoot, 'C:\\Windows')
  assert.equal(environment.WINDIR, 'C:\\Windows')
  assert.equal(environment.PATH, 'C:\\Program Files\\nodejs;C:\\Windows\\System32')
  assert.equal('DEEPSEEK_API_KEY' in environment, false)
  assert.equal('GH_TOKEN' in environment, false)
  assert.equal('USERPROFILE' in environment && environment.USERPROFILE.includes('\\Users\\'), false)
})

test('release smoke uses a hidden owned DSH child and never targets unrelated processes', () => {
  const smoke = readFileSync(new URL('./mcp-offline-smoke.mjs', import.meta.url), 'utf8')

  assert.match(smoke, /ELECTRON_RUN_AS_NODE:\s*'1'/)
  assert.match(smoke, /windowsHide:\s*true/)
  assert.match(smoke, /shell:\s*false/)
  assert.match(smoke, /DEEPSEEK_BASE_URL:\s*`http:\/\/127\.0\.0\.1:/)
  assert.match(smoke, /String\(child\.pid\)/)
  assert.match(smoke, /\['\/PID', String\(child\.pid\), '\/T', '\/F'\]/)
  assert.doesNotMatch(smoke, /taskkill(?:\.exe)?[^\r\n]*\/IM\b/i)
  assert.doesNotMatch(smoke, /Get-Process|tasklist\.exe|wmic\.exe/i)
})
