import { readdir } from 'node:fs/promises'

import { pathExists } from './safeReadFile.ts'

/**
 * Directory names never descended into while expanding workspace globs.
 * Dot-directories are skipped too, which covers `.git` and nested git
 * worktrees under `.worktrees` or `.claude/worktrees`.
 */
const IGNORED_DIRS = new Set(['node_modules'])

/**
 * Read the workspace globs from a parsed root `package.json`. Supports both
 * the array form and the `{ packages: [...] }` object form used by yarn.
 */
export const workspacePatterns = (packageJson: unknown): string[] => {
  if (!packageJson || typeof packageJson !== 'object') return []
  const workspaces = (packageJson as { workspaces?: unknown }).workspaces
  const list = Array.isArray(workspaces)
    ? workspaces
    : (workspaces as { packages?: unknown } | undefined)?.packages
  if (!Array.isArray(list)) return []
  return list.filter((entry): entry is string => typeof entry === 'string')
}

const segmentToRegExp = (segment: string): RegExp => {
  const source = segment
    .split('')
    .map((char) => {
      if (char === '*') return '[^/]*'
      if (char === '?') return '[^/]'
      return char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${source}$`)
}

const listSubdirectories = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          !IGNORED_DIRS.has(entry.name),
      )
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/**
 * Expand one glob, relative to `rootPath`, into the directories it matches.
 * Each segment is resolved level by level so only directories the pattern
 * can actually reach are read; `**` is the only recursive form.
 */
const expandPattern = async (
  rootPath: string,
  pattern: string,
): Promise<string[]> => {
  const segments = pattern
    .replace(/^\.\//, '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
  let dirs = ['']

  for (const segment of segments) {
    const next: string[] = []
    if (segment === '**') {
      const queue = [...dirs]
      while (queue.length > 0) {
        const batch = queue.splice(0)
        next.push(...batch)
        const children = await Promise.all(
          batch.map(async (dir) =>
            (await listSubdirectories(`${rootPath}/${dir}`)).map((name) =>
              dir ? `${dir}/${name}` : name,
            ),
          ),
        )
        queue.push(...children.flat())
      }
    } else if (/[*?]/.test(segment)) {
      const matcher = segmentToRegExp(segment)
      const children = await Promise.all(
        dirs.map(async (dir) =>
          (await listSubdirectories(`${rootPath}/${dir}`))
            .filter((name) => matcher.test(name))
            .map((name) => (dir ? `${dir}/${name}` : name)),
        ),
      )
      next.push(...children.flat())
    } else {
      next.push(...dirs.map((dir) => (dir ? `${dir}/${segment}` : segment)))
    }
    dirs = next
  }

  return dirs
}

/**
 * Resolve workspace globs (eg. `packages/*`) to the absolute paths of the
 * workspace `package.json` files they match. Patterns prefixed with `!`
 * exclude matches. The root package itself is never included.
 */
export const findWorkspacePackageJsons = async (
  rootPath: string,
  patterns: string[],
): Promise<string[]> => {
  const include = patterns.filter((pattern) => !pattern.startsWith('!'))
  const exclude = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1))

  const [included, excluded] = await Promise.all(
    [include, exclude].map(async (list) =>
      (await Promise.all(list.map((p) => expandPattern(rootPath, p)))).flat(),
    ),
  )
  const excludedSet = new Set(excluded)
  const candidates = [...new Set(included)].filter(
    (dir) => dir !== '' && !excludedSet.has(dir),
  )

  const existing = await Promise.all(
    candidates.map(async (dir) => {
      const path = `${rootPath}/${dir}/package.json`
      return (await pathExists(path)) ? path : null
    }),
  )
  return existing.filter((path): path is string => path !== null).sort()
}
