import { readFile } from 'node:fs/promises'

import { mergeActions } from '../lib/actions/mergeActions.ts'
import { jsrOutdated } from '../lib/jsr/outdated.ts'
import { npmOutdated } from '../lib/npm/outdated.ts'
import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'
import { pathExists } from '../lib/safeReadFile.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { DenvigProject } from '../lib/project.ts'

// Cache for parsed dependencies by project path
const dependenciesCache = new Map<string, ProjectDependencySchema[]>()

type DenoLockfileJsrPackage = {
  integrity: string
  dependencies?: string[]
}

type DenoLockfileNpmPackage = {
  integrity: string
  dependencies?: string[]
  optionalDependencies?: string[]
}

type DenoLockfile = {
  version: string
  specifiers: Record<string, string>
  jsr?: Record<string, DenoLockfileJsrPackage>
  npm?: Record<string, DenoLockfileNpmPackage>
  workspace?: {
    dependencies?: string[]
  }
}

/**
 * Parse a deno specifier like "npm:hono@^4.9.9" or "jsr:@std/assert@^1.0.14"
 * into its ecosystem, name, and version range components.
 */
const parseDenoSpecifier = (
  spec: string,
): { ecosystem: string; name: string; versionRange: string } | null => {
  const match = spec.match(/^(npm|jsr):(.+)@([^@]+)$/)
  if (!match) return null
  return {
    ecosystem: match[1],
    name: match[2],
    versionRange: match[3],
  }
}

/**
 * Find the resolved version of a dependency reference from the specifiers map.
 * Dependency refs in deno.lock can be bare like "jsr:@std/internal" without a version range,
 * so we need to find the matching specifier key that starts with the dep prefix.
 */
const findSpecifierMatch = (
  depRef: string,
  specifiers: Record<string, string>,
): { specKey: string; resolved: string } | null => {
  for (const [key, value] of Object.entries(specifiers)) {
    if (key === depRef || key.startsWith(`${depRef}@`)) {
      return { specKey: key, resolved: value }
    }
  }
  return null
}

/**
 * Find the version of an npm package from the npm section of the deno lockfile.
 * Keys are formatted as "name@version" (e.g., "bson@6.10.4", "@mongodb-js/saslprep@1.3.1").
 */
const findNpmVersionInLockfile = (
  name: string,
  npmSection: Record<string, DenoLockfileNpmPackage>,
): string | null => {
  for (const key of Object.keys(npmSection)) {
    const lastAt = key.lastIndexOf('@')
    if (lastAt <= 0) continue
    const pkgName = key.slice(0, lastAt)
    if (pkgName === name) return key.slice(lastAt + 1)
  }
  return null
}

/**
 * Safely read and parse a JSON file, returning a default on failure.
 */
const readJsonFile = async (
  filePath: string,
): Promise<Record<string, unknown>> => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return {}
  }
}

const plugin = definePlugin({
  name: 'deno',

  actions: async (project: DenvigProject) => {
    const rootFiles = project.rootFiles
    const hasDenoConfig =
      rootFiles.includes('deno.json') || rootFiles.includes('deno.jsonc')

    if (!hasDenoConfig) {
      return {}
    }

    const packageJson = await readPackageJson(project)
    const scripts = packageJson?.scripts || ({} as Record<string, string>)
    let actions: Record<string, string[]> = {
      ...Object.entries(scripts)
        .map(([key, script]) => [key, `deno ${script}`])
        .reduce(
          (acc, [key, script]) => {
            acc[key] = [script]
            return acc
          },
          {} as Record<string, string[]>,
        ),
      install: ['deno install'],
      outdated: ['deno outdated'],
    }

    const denoJsonPath = (await pathExists(`${project.path}/deno.json`))
      ? `${project.path}/deno.json`
      : (await pathExists(`${project.path}/deno.jsonc`))
        ? `${project.path}/deno.jsonc`
        : null

    const denoJson = denoJsonPath ? await readJsonFile(denoJsonPath) : {}
    const tasks = (denoJson.tasks || {}) as Record<string, string>
    actions = mergeActions(actions, {
      test: [tasks?.test ? `deno task test` : 'deno test'],
      lint: [tasks?.lint ? `deno task lint` : 'deno lint'],
      'check-types': [
        tasks?.checkTypes ? `deno task check-types` : 'deno check',
      ],
      ...Object.entries(tasks).reduce(
        (acc, [key, value]) => {
          acc[key] = [value.startsWith('deno') ? value : `deno task ${key}`]
          return acc
        },
        {} as Record<string, string[]>,
      ),
      install: ['deno install'],
      outdated: ['deno outdated'],
    })

    return actions
  },

  dependencies: async (
    project: DenvigProject,
  ): Promise<ProjectDependencySchema[]> => {
    if (!(await pathExists(`${project.path}/deno.lock`))) {
      return []
    }

    const cached = dependenciesCache.get(project.path)
    if (cached) {
      return cached
    }

    const data: Map<string, ProjectDependencySchema> = new Map()
    const directDependencyIds: Set<string> = new Set()

    const addDependency = (
      id: string,
      name: string,
      ecosystem: string,
      resolvedVersion: string,
      source: string,
      specifier: string,
    ) => {
      const existing = data.get(id)
      if (existing) {
        existing.versions.push({
          resolved: resolvedVersion,
          specifier,
          source,
        })
      } else {
        data.set(id, {
          id,
          name,
          ecosystem,
          versions: [{ resolved: resolvedVersion, specifier, source }],
        })
      }
    }

    const lockfilePath = `${project.path}/deno.lock`
    const lockfileContent = await readFile(lockfilePath, 'utf-8')
    const lockfile = JSON.parse(lockfileContent) as DenoLockfile

    // Process direct dependencies from workspace section
    const workspaceDeps = lockfile.workspace?.dependencies || []
    for (const spec of workspaceDeps) {
      const resolved = lockfile.specifiers[spec]
      if (!resolved) continue

      const parsed = parseDenoSpecifier(spec)
      if (!parsed) continue

      const id = `${parsed.ecosystem}:${parsed.name}`
      directDependencyIds.add(id)
      addDependency(
        id,
        parsed.name,
        parsed.ecosystem,
        resolved,
        '.#dependencies',
        parsed.versionRange,
      )
    }

    // Process transitive JSR dependencies
    if (lockfile.jsr) {
      for (const [pkgKey, pkgInfo] of Object.entries(lockfile.jsr)) {
        if (!pkgInfo.dependencies) continue

        for (const depRef of pkgInfo.dependencies) {
          const match = findSpecifierMatch(depRef, lockfile.specifiers)
          if (!match) continue

          const parsed = parseDenoSpecifier(match.specKey)
          if (!parsed) continue

          const id = `${parsed.ecosystem}:${parsed.name}`
          if (directDependencyIds.has(id)) continue

          addDependency(
            id,
            parsed.name,
            parsed.ecosystem,
            match.resolved,
            `deno.lock:${pkgKey}`,
            match.resolved,
          )
        }
      }
    }

    // Process transitive npm dependencies
    if (lockfile.npm) {
      for (const [pkgKey, pkgInfo] of Object.entries(lockfile.npm)) {
        const allDeps = [
          ...(pkgInfo.dependencies || []),
          ...(pkgInfo.optionalDependencies || []),
        ]
        if (allDeps.length === 0) continue

        for (const depName of allDeps) {
          const id = `npm:${depName}`
          if (directDependencyIds.has(id)) continue

          const resolvedVersion = findNpmVersionInLockfile(
            depName,
            lockfile.npm,
          )
          if (!resolvedVersion) continue

          addDependency(
            id,
            depName,
            'npm',
            resolvedVersion,
            `deno.lock:${pkgKey}`,
            resolvedVersion,
          )
        }
      }
    }

    const result = Array.from(data.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )

    dependenciesCache.set(project.path, result)

    return result
  },

  outdatedDependencies: async (project: DenvigProject, options) => {
    if (!(await pathExists(`${project.path}/deno.lock`))) {
      return []
    }
    const dependencies = await plugin.dependencies?.(project)
    if (!dependencies) return []

    const npmDeps = dependencies.filter((dep) => dep.ecosystem === 'npm')
    const jsrDeps = dependencies.filter((dep) => dep.ecosystem === 'jsr')

    const [npmResults, jsrResults] = await Promise.all([
      npmOutdated(npmDeps, options),
      jsrOutdated(jsrDeps, options),
    ])

    return [...npmResults, ...jsrResults]
  },
})

export default plugin
