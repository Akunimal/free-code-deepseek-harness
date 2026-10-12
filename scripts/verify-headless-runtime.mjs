import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const HEADLESS_RUNTIME_CHECKS = [
  {
    path: 'packages/shell/tool-pwsh-persistent/lib/index.js',
    description: 'persistent PowerShell reasserts the hidden Start-Process default',
    verify: source => source.includes('Start-Process:WindowStyle') && source.includes('Hidden'),
  },
  {
    path: 'node_modules/node-pty/lib/windowsPtyAgent.js',
    description: 'node-pty hides and pipes its ConPTY cleanup-agent fork',
    verify: source => {
      const cleanupFork = source.split(/\r?\n/u).find(line => line.includes('conpty_console_list_agent'))
      return cleanupFork !== undefined
        && cleanupFork.includes('silent: true')
        && cleanupFork.includes('windowsHide: true')
    },
  },
  {
    path: 'packages/bundle/web-app/lib/index.js',
    description: 'web-app hides its headless browser-opener launcher process',
    verify: source => source.includes('windowsHide: true'),
  },
  {
    path: 'packages/experimental/ptc-runtime-python/lib/index.js',
    description: 'PTC Python hides both the version probe and worker process',
    verify: source => (source.match(/windowsHide\s*:\s*true/gu) ?? []).length >= 2,
  },
  {
    path: 'packages/sandbox/sandbox-local/lib/index.js',
    description: 'sandbox runner probes always hide their helper consoles',
    verify: source => (source.match(/windowsHide\s*:\s*true/gu) ?? []).length >= 3,
  },
  {
    path: 'packages/sdk/client/lib/index.js',
    description: 'SDK hides its direct runtime child process',
    verify: source => source.includes('windowsHide: true'),
  },
  {
    path: 'packages/ssh/ssh/lib/index.js',
    description: 'SSH hides both its control command and transport children',
    verify: source => (source.match(/windowsHide\s*:\s*true/gu) ?? []).length >= 2,
  },
  {
    path: 'packages/subprocess/subprocess-local/lib/index.js',
    description: 'ordinary subprocess fallback hides its command console',
    verify: source => source.includes('windowsHide: true'),
  },
  {
    path: 'packages/host/directory-picker-native/lib/index.js',
    description: 'native directory-picker helper stays hidden while its dialog UI remains visible',
    verify: source => (source.match(/windowsHide\s*:\s*true/gu) ?? []).length >= 2,
  },
  {
    path: 'packages/host/open-in-app/lib/index.js',
    description: 'open-in-app defaults its launcher console to hidden',
    verify: source => /windowsHide\s*:\s*options\.windowsHide\s*\?\?\s*true/u.test(source),
  },
  {
    path: 'packages/shell/pwsh-local/lib/index.js',
    description: 'one-shot PowerShell reasserts the hidden Start-Process default',
    verify: source => /Start-Process:WindowStyle.{0,80}Hidden/su.test(source),
  },
  {
    path: 'apps/desktop/src/host-process.ts',
    description: 'desktop Host Node child starts without a console window',
    verify: source => /stdio:\s*\['ignore',\s*'pipe',\s*'pipe',\s*'ipc'\],[\s\S]{0,80}windowsHide:\s*true/u.test(source),
  },
  {
    path: 'apps/desktop/src/login-shell-environment.ts',
    description: 'desktop login-shell environment probe stays hidden',
    verify: source => /stdio:\s*\['ignore',\s*'pipe',\s*'ignore'\],[\s\S]{0,100}windowsHide:\s*true/u.test(source),
  },
  {
    path: 'packages/test-support/session-snapshot/src/launcher.ts',
    description: 'session-snapshot ACP child starts without a console window',
    verify: source => /stdio:\s*\['pipe',\s*'pipe',\s*'pipe'\],[\s\S]{0,80}windowsHide:\s*true/u.test(source),
  },
  {
    path: 'packages/llm/llm/lib/index.js',
    description: 'OCR worker child starts without a console window',
    verify: source => source.includes('windowsHide: true'),
  },
  {
    path: 'native/system/packages/entry/lib/index.js',
    description: 'native Linux system probe remains headless if invoked on Windows',
    verify: source => source.includes('windowsHide: true'),
  },
  {
    path: 'packages/util/native-command/src/runner.ts',
    description: 'native command runner hides background commands but preserves explicit visible launches',
    verify: source => /windowsHide:\s*window\s*===\s*'hidden'/u.test(source),
  },
  {
    path: 'packages/shell/shell/src/rtk.ts',
    description: 'RTK availability probe stays hidden',
    verify: source => source.includes('windowsHide: true'),
  },
  {
    path: 'packages/shell/shell/src/caveman.ts',
    description: 'Caveman availability probe stays hidden',
    verify: source => source.includes('windowsHide: true'),
  },
  {
    path: 'apps/desktop/src/command-manager-entry.ts',
    description: 'command-manager PowerShell worker stays hidden',
    verify: source => source.includes('windowsHide: true'),
  },
  {
    path: 'apps/desktop/src/command-management.ts',
    description: 'command-manager Node worker stays hidden',
    verify: source => source.includes('windowsHide: true'),
  },
]

/** Fail closed unless each runtime-owned headless process contract is in the generated payload. */
export function verifyHeadlessRuntime(runtimeDir = join(repoRoot, 'apps/shell/resources/freecode/dsh')) {
  const failures = []
  for (const check of HEADLESS_RUNTIME_CHECKS) {
    const path = join(runtimeDir, check.path)
    let source
    try {
      source = readFileSync(path, 'utf8')
    } catch (error) {
      failures.push(`${check.path}: cannot read (${error instanceof Error ? error.message : String(error)})`)
      continue
    }
    if (!check.verify(source)) failures.push(`${check.path}: ${check.description}`)
  }
  if (failures.length > 0) {
    throw new Error(`verify-headless-runtime: packaged DSH is missing required headless behavior:\n- ${failures.join('\n- ')}`)
  }
  return { checked: HEADLESS_RUNTIME_CHECKS.length }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyHeadlessRuntime(process.argv[2] === undefined ? undefined : resolve(process.argv[2]))
    console.log(`verify-headless-runtime: PASS — ${result.checked} packaged headless-process contracts`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
