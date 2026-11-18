import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * A directory inside a checkout that holds its own dependency manifests.
 * Dependency plugins run once per scope, reading files relative to `path`.
 */
export type ManifestScope = {
  /**
   * Absolute path of the directory.
   */
  path: string
  /**
   * Files directly inside the directory.
   */
  rootFiles: string[]
}

/**
 * Manifest files grouped by ecosystem. A lockfile always marks its directory
 * as a separate install. A manifest without a lockfile only counts when no
 * parent directory has a lockfile for the same ecosystem, which excludes
 * workspace members (eg. uv or deno workspaces).
 */
const ECOSYSTEM_FILES = [
  {
    lockfiles: ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'],
    manifests: [],
  },
  { lockfiles: ['uv.lock'], manifests: ['pyproject.toml'] },
  { lockfiles: ['Gemfile.lock'], manifests: ['Gemfile'] },
  { lockfiles: ['deno.lock'], manifests: ['deno.json', 'deno.jsonc'] },
]

const MANIFEST_FILE_NAMES = ECOSYSTEM_FILES.flatMap((group) => [
  ...group.lockfiles,
  ...group.manifests,
])

/**
 * Directory names that hold test fixtures or vendored code rather than
 * dependencies the project installs.
 */
const IGNORED_SEGMENTS = new Set([
  'node_modules',
  'vendor',
  'test',
  'tests',
  '__tests__',
  'spec',
  'fixtures',
  '__fixtures__',
  'testdata',
])

/**
 * Pick the directories that hold their own dependency manifests from a list of
 * file paths relative to the checkout root. Always includes the root (`.`).
 *
 * @example
 * findManifestDirs(['app/uv.lock', 'app/pyproject.toml']) // ['.', 'app']
 */
export const findManifestDirs = (files: string[]): string[] => {
  const filesByDir = new Map<string, Set<string>>()
  for (const file of files) {
    const dir = posix.dirname(file)
    if (dir.split('/').some((segment) => IGNORED_SEGMENTS.has(segment))) {
      continue
    }
    const set = filesByDir.get(dir) ?? new Set<string>()
    set.add(posix.basename(file))
    filesByDir.set(dir, set)
  }

  const ancestorsOf = (dir: string): string[] => {
    const ancestors: string[] = []
    let current = dir
    while (current !== '.') {
      current = posix.dirname(current)
      ancestors.push(current)
    }
    return ancestors
  }

  const dirs = new Set<string>(['.'])
  for (const [dir, names] of filesByDir) {
    for (const { lockfiles, manifests } of ECOSYSTEM_FILES) {
      const hasLockfile = lockfiles.some((name) => names.has(name))
      const hasManifest = manifests.some((name) => names.has(name))
      const isWorkspaceMember =
        !hasLockfile &&
        ancestorsOf(dir).some((ancestor) =>
          lockfiles.some((name) => filesByDir.get(ancestor)?.has(name)),
        )
      if (hasLockfile || (hasManifest && !isWorkspaceMember)) {
        dirs.add(dir)
      }
    }
  }

  return [...dirs].sort()
}

/**
 * List tracked and untracked (but not ignored) manifest files in a checkout
 * using git, which skips `node_modules`, nested worktrees and anything else
 * in `.gitignore`. Returns null when the directory is not a git checkout.
 */
const listManifestFiles = async (path: string): Promise<string[] | null> => {
  const pathspecs = MANIFEST_FILE_NAMES.map((name) => `:(glob)**/${name}`)
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'].concat(
        '--',
        pathspecs,
      ),
      { cwd: path, maxBuffer: 16 * 1024 * 1024 },
    )
    return [...new Set(stdout.split('\0').filter(Boolean))]
  } catch {
    return null
  }
}

/**
 * Detect every directory in a checkout that holds its own dependency
 * manifests. Directories are relative to the checkout root and always include
 * the root itself (`.`). Outside of git only the root is checked.
 */
export const detectManifestDirs = async (path: string): Promise<string[]> => {
  const files = await listManifestFiles(path)
  return files ? findManifestDirs(files) : ['.']
}

/**
 * Build a scope for a manifest directory, listing the files inside it.
 */
export const manifestScope = async (
  rootPath: string,
  dir: string,
): Promise<ManifestScope> => {
  const path = dir === '.' ? rootPath : join(rootPath, dir)
  const rootFiles = await readdir(path).catch(() => [] as string[])
  return { path, rootFiles }
}
