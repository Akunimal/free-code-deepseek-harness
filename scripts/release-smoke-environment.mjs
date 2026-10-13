import { win32 } from 'node:path'

/**
 * Build the complete environment for release-smoke-owned child processes.
 * Deliberately do not accept or spread process.env: only Windows runtime
 * essentials are inherited by value, and every profile/cache/temp directory
 * is redirected underneath the smoke's disposable root.
 */
export function createReleaseSmokeEnvironment({ systemRoot, nodeExecutable, smokeRoot }) {
  if (typeof systemRoot !== 'string' || !win32.isAbsolute(systemRoot)) {
    throw new Error('release smoke requires an absolute Windows SystemRoot')
  }
  if (typeof nodeExecutable !== 'string' || !win32.isAbsolute(nodeExecutable)) {
    throw new Error('release smoke requires an absolute Node executable')
  }
  if (typeof smokeRoot !== 'string' || !win32.isAbsolute(smokeRoot)) {
    throw new Error('release smoke requires an absolute scratch root')
  }

  const root = win32.resolve(smokeRoot)
  const inside = (...parts) => {
    const target = win32.resolve(root, ...parts)
    const rel = win32.relative(root, target)
    if (rel === '..' || rel.startsWith(`..${win32.sep}`) || win32.isAbsolute(rel)) {
      throw new Error(`release smoke scratch path escaped its root: ${target}`)
    }
    return target
  }

  const home = inside('home')
  const temp = inside('temp')
  const appData = inside('appdata', 'roaming')
  const localAppData = inside('appdata', 'local')
  const pathEntries = [win32.dirname(nodeExecutable), win32.join(systemRoot, 'System32')]

  return {
    SystemRoot: win32.resolve(systemRoot),
    WINDIR: win32.resolve(systemRoot),
    PATH: pathEntries.join(';'),
    HOME: home,
    USERPROFILE: home,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    TEMP: temp,
    TMP: temp,
  }
}
