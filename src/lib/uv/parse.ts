import { existsSync, readFileSync } from 'node:fs'

import { parseToml } from './toml.ts'

import type { ProjectDependencySchema } from '../dependencies.ts'
import type { DenvigProject } from '../project.ts'

type PyProjectDependency = {
  name: string
  specifier: string
  group: 'dependencies' | 'devDependencies'
}

type UvLockPackage = {
  name: string
  version: string
  dependencies: string[]
}

type UvLockData = {
  packages: Record<string, UvLockPackage>
  projectName: string | null
}

/**
 * Normalize a Python package name to lowercase with hyphens replaced by underscores
 * PEP 503 normalization for comparison
 */
const normalizePackageName = (name: string): string => {
  return name.toLowerCase().replace(/_/g, '-')
}

/**
 * Parse version specifier from a dependency string like "fastapi>=0.119.0"
 */
const parseVersionSpecifier = (
  dep: string,
): { name: string; specifier: string } => {
  // Match package name and optional version specifier
  // Handles: "package", "package>=1.0", "package==1.0", "package~=1.0", etc.
  const match = dep.match(/^([a-zA-Z0-9_-]+(?:\[[^\]]+\])?)(.*)$/)
  if (match) {
    const name = match[1].replace(/\[.*\]$/, '') // Remove extras like [dev]
    const specifier = match[2].trim() || '*'
    return { name, specifier }
  }
  return { name: dep, specifier: '*' }
}

/**
 * Parse pyproject.toml to extract direct dependencies
 */
export const parsePyProject = (content: string): PyProjectDependency[] => {
  const dependencies: PyProjectDependency[] = []

  try {
    const data = parseToml(content) as {
      project?: {
        dependencies?: string[]
        'optional-dependencies'?: Record<string, string[]>
      }
      tool?: {
        uv?: {
          'dev-dependencies'?: string[]
        }
      }
    }

    // Parse main dependencies
    if (data.project?.dependencies) {
      for (const dep of data.project.dependencies) {
        const { name, specifier } = parseVersionSpecifier(dep)
        dependencies.push({
          name,
          specifier,
          group: 'dependencies',
        })
      }
    }

    // Parse dev dependencies from [tool.uv.dev-dependencies]
    if (data.tool?.uv?.['dev-dependencies']) {
      for (const dep of data.tool.uv['dev-dependencies']) {
        const { name, specifier } = parseVersionSpecifier(dep)
        dependencies.push({
          name,
          specifier,
          group: 'devDependencies',
        })
      }
    }

    // Parse optional dependencies (treat as devDependencies)
    if (data.project?.['optional-dependencies']) {
      for (const group of Object.values(
        data.project['optional-dependencies'],
      )) {
        for (const dep of group) {
          const { name, specifier } = parseVersionSpecifier(dep)
          dependencies.push({
            name,
            specifier,
            group: 'devDependencies',
          })
        }
      }
    }
  } catch {
    // Invalid TOML, return empty
  }

  return dependencies
}

/**
 * Parse uv.lock to extract resolved versions and dependencies
 */
export const parseUvLock = (content: string): UvLockData => {
  const packages: Record<string, UvLockPackage> = {}
  let projectName: string | null = null

  try {
    const data = parseToml(content) as {
      package?: Array<{
        name: string
        version: string
        source?: { virtual?: string; registry?: string }
        dependencies?: Array<{ name: string }>
      }>
    }

    if (data.package) {
      for (const pkg of data.package) {
        const normalizedName = normalizePackageName(pkg.name)

        // Detect the project package (has virtual source)
        if (pkg.source?.virtual) {
          projectName = normalizedName
        }

        const deps =
          pkg.dependencies?.map((d) => normalizePackageName(d.name)) || []

        packages[normalizedName] = {
          name: pkg.name,
          version: pkg.version,
          dependencies: deps,
        }
      }
    }
  } catch {
    // Invalid TOML, return empty
  }

  return { packages, projectName }
}

/**
 * Parse Python dependencies from pyproject.toml and uv.lock
 */
export const parseUvDependencies = async (
  project: DenvigProject,
): Promise<ProjectDependencySchema[]> => {
  const pyprojectPath = `${project.path}/pyproject.toml`
  const lockfilePath = `${project.path}/uv.lock`

  if (!existsSync(pyprojectPath)) {
    return []
  }

  const data: Map<string, ProjectDependencySchema> = new Map()
  const directDependencyNames: Set<string> = new Set()

  // Helper to add a dependency version entry
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

  // Add uv as a system dependency
  data.set('pypi:uv', {
    id: 'pypi:uv',
    name: 'uv',
    ecosystem: 'system',
    versions: [],
  })

  // Parse pyproject.toml for direct dependencies
  const pyprojectContent = readFileSync(pyprojectPath, 'utf-8')
  const pyprojectDeps = parsePyProject(pyprojectContent)

  for (const dep of pyprojectDeps) {
    directDependencyNames.add(normalizePackageName(dep.name))
  }

  // If lockfile exists, use it for resolved versions
  if (existsSync(lockfilePath)) {
    const lockfileContent = readFileSync(lockfilePath, 'utf-8')
    const lockData = parseUvLock(lockfileContent)

    // Add direct dependencies with their resolved versions
    for (const dep of pyprojectDeps) {
      const normalizedName = normalizePackageName(dep.name)
      const pkg = lockData.packages[normalizedName]
      if (pkg) {
        addDependency(
          `pypi:${normalizedName}`,
          pkg.name,
          'pypi',
          pkg.version,
          `.#${dep.group}`,
          dep.specifier,
        )
      }
    }

    // Add transitive dependencies
    for (const [pkgName, pkg] of Object.entries(lockData.packages)) {
      // Skip the project itself and direct dependencies
      if (
        pkgName === lockData.projectName ||
        directDependencyNames.has(pkgName)
      ) {
        continue
      }

      // Find parent packages that depend on this one
      for (const [, parentPkg] of Object.entries(lockData.packages)) {
        if (parentPkg.dependencies.includes(pkgName)) {
          const source = `uv.lock:${parentPkg.name}@${parentPkg.version}`
          addDependency(
            `pypi:${pkgName}`,
            pkg.name,
            'pypi',
            pkg.version,
            source,
            '*', // uv.lock doesn't store specifiers for transitive deps
          )
        }
      }
    }
  } else {
    // No lockfile - add direct dependencies without resolved versions
    for (const dep of pyprojectDeps) {
      const normalizedName = normalizePackageName(dep.name)
      addDependency(
        `pypi:${normalizedName}`,
        dep.name,
        'pypi',
        dep.specifier,
        `.#${dep.group}`,
        dep.specifier,
      )
    }
  }

  return Array.from(data.values()).sort((a, b) => a.name.localeCompare(b.name))
}
