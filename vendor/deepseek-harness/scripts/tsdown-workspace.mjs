import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function childDirectories(parent) {
  if (!isDirectory(parent)) return []
  return readdirSync(parent)
    .filter((name) => !name.startsWith('.'))
    .map((name) => join(parent, name))
    .filter(isDirectory)
}

/** Resolve the current tsdown directory globs to actual workspace packages. */
export function discoverTsdownWorkspacePackages(root, patterns) {
  const absoluteRoot = resolve(root)
  const directories = new Set()

  for (const pattern of patterns) {
    let candidates = [absoluteRoot]
    for (const segment of pattern.split('/')) {
      if (segment === '*') {
        candidates = candidates.flatMap(childDirectories)
      } else if (segment.includes('*')) {
        throw new Error(`Unsupported tsdown workspace segment: ${segment}`)
      } else {
        candidates = candidates.map((candidate) => join(candidate, segment))
      }
    }

    for (const candidate of candidates) {
      if (!isDirectory(candidate) || !existsSync(join(candidate, 'package.json'))) continue
      directories.add(relative(absoluteRoot, candidate).split(sep).join('/'))
    }
  }

  return [...directories].sort()
}
