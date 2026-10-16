import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

function pathsForPatch(contents, vendorPrefix) {
  const paths = new Set()
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+?)(?:\t.*)?$/u)
    if (match === null || match[1] === '/dev/null') continue
    const path = match[1]
    if (!path.startsWith(vendorPrefix) || path.split('/').includes('..') || isAbsolute(path)) {
      throw new Error(`patch target escapes the vendor prefix: ${path}`)
    }
    paths.add(path)
  }
  return [...paths]
}

function apply(patchPath, cwd, reverse) {
  const result = spawnSync('git', [
    '-c', 'core.autocrlf=false', 'apply', ...(reverse ? ['--reverse'] : []), '--whitespace=nowarn', patchPath,
  ], { cwd, encoding: 'utf8', windowsHide: true, shell: false })
  if (result.error || result.status !== 0) {
    return { ok: false, detail: result.error?.message ?? result.stderr ?? result.stdout ?? `git exited ${result.status}` }
  }
  return { ok: true }
}

function check(patchPath, cwd, reverse) {
  const result = spawnSync('git', [
    '-c', 'core.autocrlf=false', 'apply', '--check', ...(reverse ? ['--reverse'] : []), '--whitespace=nowarn', patchPath,
  ], { cwd, encoding: 'utf8', windowsHide: true, shell: false })
  return result.status === 0
}

// Unified text patches use LF while Windows checkouts can contain CRLF.
// Canonicalize only scratch/comparison bytes; never rewrite the user's file or
// ignore spaces/content divergence. Preserve binary buffers byte-for-byte.
function patchTextBytes(contents) {
  return contents.includes(0) ? contents : Buffer.from(contents.toString('latin1').replaceAll('\r\n', '\n'), 'latin1')
}

function replayGroup({ root, patchFiles, paths }) {
  const rootPath = resolve(root)
  const original = new Map(paths.map((path) => {
    const absolute = resolve(rootPath, path)
    const contained = relative(rootPath, absolute)
    if (contained.startsWith(`..${sep}`) || contained === '..' || isAbsolute(contained)) {
      throw new Error(`patch target resolves outside the repository: ${path}`)
    }
    return [path, existsSync(absolute) ? readFileSync(absolute) : undefined]
  }))

  const scratchRoot = mkdtempSync(join(tmpdir(), 'freecode-patch-stack-'))
  try {
    for (const [path, contents] of original) {
      if (contents === undefined) continue
      const target = join(scratchRoot, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, patchTextBytes(contents))
    }

    for (const { entry, path } of [...patchFiles].reverse()) {
      const result = apply(path, scratchRoot, true)
      if (!result.ok) return { ok: false, stage: 'reverse', patch: entry.file, detail: result.detail }
    }
    for (const { entry, path } of patchFiles) {
      const result = apply(path, scratchRoot, false)
      if (!result.ok) return { ok: false, stage: 'forward', patch: entry.file, detail: result.detail }
    }
    for (const [path, originalBytes] of original) {
      const expected = originalBytes === undefined ? undefined : patchTextBytes(originalBytes)
      const actualPath = join(scratchRoot, path)
      const actual = existsSync(actualPath) ? readFileSync(actualPath) : undefined
      if ((expected === undefined) !== (actual === undefined) || (expected && actual && !expected.equals(actual))) {
        let firstByte = -1
        if (expected && actual) {
          const limit = Math.min(expected.length, actual.length)
          firstByte = 0
          while (firstByte < limit && expected[firstByte] === actual[firstByte]) firstByte++
          if (firstByte === limit) firstByte = limit
        }
        return {
          ok: false,
          stage: 'compare',
          patch: path,
          detail: `ordered stack replay differs at byte ${firstByte} (expected ${expected?.length ?? 'missing'}, got ${actual?.length ?? 'missing'})`,
        }
      }
    }
    return { ok: true }
  } finally {
    const tempRoot = resolve(tmpdir())
    const target = resolve(scratchRoot)
    if (target.startsWith(`${tempRoot}${sep}`) && target.slice(tempRoot.length + 1).startsWith('freecode-patch-stack-')) {
      rmSync(target, { recursive: true, force: true })
    }
  }
}

/**
 * Find overlapping patches that are already applied as an ordered group.
 * Individual reverse checks fail when a later patch edits a line introduced
 * by an earlier one, even though the combined patch sequence is valid.
 */
export function verifyOverlappingAppliedPatches({ root, patchDir, patches, vendorPrefix }) {
  const ordered = [...patches].sort((a, b) => a.order - b.order)
  const patchFiles = ordered.map((entry) => {
    const patchPath = resolve(patchDir, entry.file)
    const contents = readFileSync(patchPath, 'utf8')
    return { entry, path: patchPath, contents, paths: pathsForPatch(contents, vendorPrefix) }
  })
  const overlapping = patchFiles.filter(({ path }) => !check(path, root, false) && !check(path, root, true))
  const alreadyApplied = new Set(patchFiles.filter(({ path }) => check(path, root, true)))
  const remaining = new Set(overlapping)
  const groups = []
  while (remaining.size > 0) {
    const group = [remaining.values().next().value]
    remaining.delete(group[0])
    const groupPaths = new Set(group[0].paths)
    let added = true
    while (added) {
      added = false
      const candidates = new Set([...remaining, ...alreadyApplied])
      for (const candidate of candidates) {
        if (!candidate.paths.some((path) => groupPaths.has(path))) continue
        if (!remaining.has(candidate) && !alreadyApplied.has(candidate)) continue
        remaining.delete(candidate)
        alreadyApplied.delete(candidate)
        group.push(candidate)
        for (const path of candidate.paths) groupPaths.add(path)
        added = true
      }
    }
    groups.push(group.sort((a, b) => a.entry.order - b.entry.order))
  }

  const stackedApplied = []
  for (const group of groups) {
    const paths = [...new Set(group.flatMap(({ paths: touched }) => touched))].sort()
    const result = replayGroup({ root, patchFiles: group, paths })
    if (!result.ok) return result
    stackedApplied.push(...group.map(({ entry }) => entry.file))
  }
  return { ok: true, alreadyApplied: stackedApplied }
}
