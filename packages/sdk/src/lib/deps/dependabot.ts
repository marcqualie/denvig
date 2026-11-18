import { lockfileFromSource, parseParentFromSource } from './tree.ts'

import type { ProjectDependencySchema } from '../dependencies.ts'

/**
 * Package URL types for each denvig ecosystem the snapshot supports. GitHub
 * Actions are detected natively by GitHub so they are deliberately absent.
 */
const PURL_TYPES: Record<string, string> = {
  npm: 'npm',
  rubygems: 'gem',
  pypi: 'pypi',
}

/**
 * Manifest file used when no lockfile is detected for an ecosystem.
 */
const MANIFEST_FILES: Record<string, string> = {
  npm: 'package.json',
  rubygems: 'Gemfile',
  pypi: 'pyproject.toml',
}

/**
 * Commit and CI metadata attached to a dependency snapshot.
 */
export type DependabotSnapshotContext = {
  sha: string
  ref: string
  correlator: string
  jobId: string
  jobUrl?: string
  /**
   * Path of the project relative to the repository root (eg. `apps/web`), or
   * an empty string when the project is the repository root.
   */
  pathPrefix: string
}

export type DependabotResolvedDependency = {
  package_url: string
  relationship: 'direct' | 'indirect'
  scope: 'runtime' | 'development'
  dependencies: string[]
}

export type DependabotManifest = {
  name: string
  file: { source_location: string }
  resolved: Record<string, DependabotResolvedDependency>
}

/**
 * Payload accepted by GitHub's dependency submission API
 * (`POST /repos/{owner}/{repo}/dependency-graph/snapshots`).
 */
export type DependabotSnapshot = {
  version: 0
  sha: string
  ref: string
  job: { correlator: string; id: string; html_url?: string }
  detector: { name: string; version: string; url: string }
  scanned: string
  manifests: Record<string, DependabotManifest>
}

export type BuildDependabotSnapshotInput = {
  dependencies: ProjectDependencySchema[]
  context: DependabotSnapshotContext
  detector: { name: string; version: string; url: string }
  scanned: string
  /**
   * Directories (relative to the project root) holding their own dependency
   * manifests. Used to place direct dependencies that have no lockfile.
   * Defaults to the project root only.
   */
  manifestDirs?: string[]
}

/**
 * Build a package URL for a dependency, or null when the ecosystem is not
 * supported or the version is not a concrete release (eg. `link:`, `file:`,
 * git URLs).
 *
 * @example
 * toPackageUrl('npm', '@fastify/busboy', '3.2.0') // 'pkg:npm/%40fastify/busboy@3.2.0'
 */
export const toPackageUrl = (
  ecosystem: string,
  name: string,
  version: string,
): string | null => {
  const type = PURL_TYPES[ecosystem]
  if (!type) return null

  const parenIndex = version.indexOf('(')
  const cleanVersion =
    parenIndex === -1 ? version : version.slice(0, parenIndex)
  if (!/^\d[^\s:/]*$/.test(cleanVersion)) return null

  const encodedName = name
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `pkg:${type}/${encodedName}@${encodeURIComponent(cleanVersion)}`
}

/**
 * Read the directory and dependency group from a direct dependency source
 * (`apps/web#devDependencies`). Returns null for anything else.
 */
const parseDirectSource = (
  source: string,
): { path: string; isDev: boolean } | null => {
  const match = source.match(/^(.*)#(dependencies|devDependencies)$/)
  if (!match) return null
  return { path: match[1] || '.', isDev: match[2] === 'devDependencies' }
}

/**
 * Join path segments, dropping empty and `.` segments.
 */
const joinPath = (...parts: string[]): string =>
  parts
    .flatMap((part) => part.split('/'))
    .filter((part) => part !== '' && part !== '.')
    .join('/')

/**
 * Directory of a manifest path relative to the project root (`.` for the
 * root itself).
 */
const dirOf = (path: string): string => {
  const index = path.lastIndexOf('/')
  return index === -1 ? '.' : path.slice(0, index)
}

/**
 * Check if `dir` is `path` or one of its parent directories.
 */
const containsPath = (dir: string, path: string): boolean =>
  dir === '.' || path === dir || path.startsWith(`${dir}/`)

/**
 * Build a GitHub dependency snapshot from the dependencies detected by the
 * plugins. Each lockfile becomes a manifest, so a resolved version shared
 * across workspace packages is only reported once while separate installs in
 * subdirectories (eg. `app/uv.lock`) get their own manifest. Direct
 * dependencies belong to the nearest lockfile at or above their directory,
 * falling back to the manifest file of the nearest manifest directory.
 */
export const buildDependabotSnapshot = ({
  dependencies,
  context,
  detector,
  scanned,
  manifestDirs = ['.'],
}: BuildDependabotSnapshotInput): DependabotSnapshot => {
  const lockfiles = new Map<string, Set<string>>()
  for (const dep of dependencies) {
    for (const version of dep.versions) {
      const lockfile = lockfileFromSource(version.source)
      if (!lockfile) continue
      const set = lockfiles.get(dep.ecosystem) ?? new Set<string>()
      set.add(lockfile)
      lockfiles.set(dep.ecosystem, set)
    }
  }

  /**
   * Pick the deepest candidate directory that contains `path`.
   */
  const nearest = (candidates: Iterable<string>, path: string) => {
    let match: string | null = null
    for (const dir of candidates) {
      if (containsPath(dir, path) && (!match || dir.length > match.length)) {
        match = dir
      }
    }
    return match
  }

  const manifestForDirectSource = (ecosystem: string, path: string): string => {
    const ecosystemLockfiles = [...(lockfiles.get(ecosystem) ?? [])]
    const lockfileDir = nearest(ecosystemLockfiles.map(dirOf), path)
    const lockfile = ecosystemLockfiles.find((l) => dirOf(l) === lockfileDir)
    if (lockfile) return lockfile
    return joinPath(
      nearest(manifestDirs, path) ?? '.',
      MANIFEST_FILES[ecosystem],
    )
  }

  const children = new Map<string, Map<string, Set<string>>>()
  const roots = new Map<string, { runtime: Set<string>; dev: Set<string> }>()

  for (const dep of dependencies) {
    for (const version of dep.versions) {
      const purl = toPackageUrl(dep.ecosystem, dep.name, version.resolved)
      if (!purl) continue

      const lockfile = lockfileFromSource(version.source)
      if (lockfile) {
        const parent = parseParentFromSource(version.source)
        if (!parent) continue
        const parentPurl = toPackageUrl(
          dep.ecosystem,
          parent.name,
          parent.version,
        )
        if (!parentPurl) continue
        const graph = children.get(lockfile) ?? new Map<string, Set<string>>()
        const set = graph.get(parentPurl) ?? new Set<string>()
        set.add(purl)
        graph.set(parentPurl, set)
        children.set(lockfile, graph)
        continue
      }

      const direct = parseDirectSource(version.source)
      if (!direct) continue
      const manifest = manifestForDirectSource(dep.ecosystem, direct.path)
      const entry = roots.get(manifest) ?? {
        runtime: new Set<string>(),
        dev: new Set<string>(),
      }
      entry[direct.isDev ? 'dev' : 'runtime'].add(purl)
      roots.set(manifest, entry)
    }
  }

  const manifests: Record<string, DependabotManifest> = {}
  const entries = [...roots.entries()].map(([manifest, entry]) => ({
    ...entry,
    graph: children.get(manifest) ?? new Map<string, Set<string>>(),
    manifestPath: joinPath(context.pathPrefix, manifest),
  }))
  entries.sort((a, b) => a.manifestPath.localeCompare(b.manifestPath))

  for (const { runtime, dev, graph, manifestPath } of entries) {
    const walk = (start: Iterable<string>): Set<string> => {
      const seen = new Set<string>()
      const stack = [...start]
      while (stack.length > 0) {
        const purl = stack.pop() as string
        if (seen.has(purl)) continue
        seen.add(purl)
        for (const child of graph.get(purl) ?? []) stack.push(child)
      }
      return seen
    }
    const runtimeReachable = walk(runtime)
    const allReachable = walk([...runtime, ...dev])

    const resolved: Record<string, DependabotResolvedDependency> = {}
    for (const purl of [...allReachable].sort()) {
      resolved[purl] = {
        package_url: purl,
        relationship:
          runtime.has(purl) || dev.has(purl) ? 'direct' : 'indirect',
        scope: runtimeReachable.has(purl) ? 'runtime' : 'development',
        dependencies: [...(graph.get(purl) ?? [])].sort(),
      }
    }

    manifests[manifestPath] = {
      name: manifestPath,
      file: { source_location: manifestPath },
      resolved,
    }
  }

  return {
    version: 0,
    sha: context.sha,
    ref: context.ref,
    job: {
      correlator: context.correlator,
      id: context.jobId,
      ...(context.jobUrl ? { html_url: context.jobUrl } : {}),
    },
    detector,
    scanned,
    manifests,
  }
}
