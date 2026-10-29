import { isLockfileSource, parseParentFromSource } from './tree.ts'

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
 * Manifest file that declares direct dependencies for each ecosystem.
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
 * Split a direct dependency source (`apps/web#devDependencies`) into its
 * importer path and dependency group. Returns null for anything else.
 */
const parseDirectSource = (
  source: string,
): { importer: string; isDev: boolean } | null => {
  const match = source.match(/^(.*)#(dependencies|devDependencies)$/)
  if (!match) return null
  return { importer: match[1], isDev: match[2] === 'devDependencies' }
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
 * Build a GitHub dependency snapshot from the dependencies detected by the
 * plugins. Each importer (workspace package) becomes its own manifest
 * containing its direct dependencies plus everything they pull in.
 */
export const buildDependabotSnapshot = ({
  dependencies,
  context,
  detector,
  scanned,
}: BuildDependabotSnapshotInput): DependabotSnapshot => {
  const children = new Map<string, Set<string>>()
  const roots = new Map<string, { runtime: Set<string>; dev: Set<string> }>()

  for (const dep of dependencies) {
    for (const version of dep.versions) {
      const purl = toPackageUrl(dep.ecosystem, dep.name, version.resolved)
      if (!purl) continue

      if (isLockfileSource(version.source)) {
        const parent = parseParentFromSource(version.source)
        if (!parent) continue
        const parentPurl = toPackageUrl(
          dep.ecosystem,
          parent.name,
          parent.version,
        )
        if (!parentPurl) continue
        const set = children.get(parentPurl) ?? new Set<string>()
        set.add(purl)
        children.set(parentPurl, set)
        continue
      }

      const direct = parseDirectSource(version.source)
      if (!direct) continue
      const manifestPath = joinPath(
        context.pathPrefix,
        direct.importer,
        MANIFEST_FILES[dep.ecosystem],
      )
      const entry = roots.get(manifestPath) ?? {
        runtime: new Set<string>(),
        dev: new Set<string>(),
      }
      entry[direct.isDev ? 'dev' : 'runtime'].add(purl)
      roots.set(manifestPath, entry)
    }
  }

  const walk = (start: Iterable<string>): Set<string> => {
    const seen = new Set<string>()
    const stack = [...start]
    while (stack.length > 0) {
      const purl = stack.pop() as string
      if (seen.has(purl)) continue
      seen.add(purl)
      for (const child of children.get(purl) ?? []) stack.push(child)
    }
    return seen
  }

  const manifests: Record<string, DependabotManifest> = {}
  for (const manifestPath of [...roots.keys()].sort()) {
    const { runtime, dev } = roots.get(manifestPath) as {
      runtime: Set<string>
      dev: Set<string>
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
        dependencies: [...(children.get(purl) ?? [])].sort(),
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
