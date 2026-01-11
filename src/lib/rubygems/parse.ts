import { existsSync, readFileSync } from 'node:fs'

import type { ProjectDependencySchema } from '../dependencies.ts'
import type { DenvigProject } from '../project.ts'

type GemfileDependency = {
  name: string
  specifier: string
  group: 'dependencies' | 'devDependencies'
}

type GemfileLockSpec = {
  version: string
  dependencies: Record<string, string>
}

type GemfileLockData = {
  specs: Record<string, GemfileLockSpec>
  dependencies: Record<string, string>
}

/**
 * Parse the Gemfile to extract direct dependencies with their specifiers
 */
export const parseGemfile = (content: string): GemfileDependency[] => {
  const dependencies: GemfileDependency[] = []
  const lines = content.split('\n')

  let currentGroup: 'dependencies' | 'devDependencies' = 'dependencies'
  let groupDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') {
      continue
    }

    // Track group blocks
    if (trimmed.startsWith('group ')) {
      // Check if it's a dev/test group
      const isDevGroup =
        trimmed.includes(':development') || trimmed.includes(':test')
      if (isDevGroup) {
        currentGroup = 'devDependencies'
      }
      if (trimmed.includes(' do')) {
        groupDepth++
      }
      continue
    }

    // Track end of blocks
    if (trimmed === 'end') {
      groupDepth--
      if (groupDepth <= 0) {
        currentGroup = 'dependencies'
        groupDepth = 0
      }
      continue
    }

    // Parse gem declarations
    const gemMatch = trimmed.match(
      /^gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/,
    )
    if (gemMatch) {
      const name = gemMatch[1]
      const specifier = gemMatch[2] || '*'

      dependencies.push({
        name,
        specifier,
        group: currentGroup,
      })
    }
  }

  return dependencies
}

/**
 * Parse the Gemfile.lock to extract resolved versions and dependencies
 */
export const parseGemfileLock = (content: string): GemfileLockData => {
  const specs: Record<string, GemfileLockSpec> = {}
  const dependencies: Record<string, string> = {}

  const lines = content.split('\n')
  let section: 'none' | 'gem' | 'specs' | 'dependencies' | 'platforms' = 'none'
  let currentGem: string | null = null
  let currentVersion: string | null = null

  for (const line of lines) {
    const trimmed = line.trimEnd()

    // Detect section changes
    if (trimmed === 'GEM') {
      section = 'gem'
      continue
    }
    if (trimmed === 'PLATFORMS') {
      section = 'platforms'
      continue
    }
    if (trimmed === 'DEPENDENCIES') {
      section = 'dependencies'
      continue
    }
    if (trimmed === 'BUNDLED WITH') {
      section = 'none'
      continue
    }

    // Process specs section within GEM
    if (section === 'gem' && trimmed === '  specs:') {
      section = 'specs'
      continue
    }

    // Parse specs section
    if (section === 'specs') {
      // Empty line ends the specs section
      if (trimmed === '') {
        continue
      }

      // Check indentation level
      const indentMatch = line.match(/^(\s*)/)
      const indent = indentMatch ? indentMatch[1].length : 0
      const content = line.trim() // Use trimmed content for regex matching

      if (indent === 4) {
        // Top-level gem with version: "    gem_name (1.0.0)"
        // Handle platform-specific gems like "nokogiri (1.18.3-arm64-darwin)"
        const gemMatch = content.match(/^([^\s(]+)\s+\(([^)]+)\)/)
        if (gemMatch) {
          // Extract base gem name without platform suffix
          const fullVersion = gemMatch[2]
          // Extract just the version number (strip platform)
          const versionMatch = fullVersion.match(/^[\d.]+/)
          const version = versionMatch ? versionMatch[0] : fullVersion

          currentGem = gemMatch[1]
          currentVersion = version

          // Initialize if not exists (may have multiple platform variants)
          if (!specs[currentGem]) {
            specs[currentGem] = {
              version,
              dependencies: {},
            }
          }
        }
      } else if (indent === 6 && currentGem && currentVersion) {
        // Dependency line: "      dep_name (>= 1.0)"
        const depMatch = content.match(/^([^\s(]+)(?:\s+\(([^)]+)\))?/)
        if (depMatch) {
          const depName = depMatch[1]
          const depSpec = depMatch[2] || '*'
          specs[currentGem].dependencies[depName] = depSpec
        }
      }
    }

    // Parse dependencies section
    if (section === 'dependencies') {
      if (trimmed === '' || trimmed.startsWith(' ') === false) {
        continue
      }

      // Format: "  gem_name" or "  gem_name (>= 1.0)"
      const depMatch = trimmed.match(/^\s+([^\s(!]+)(?:\s+\(([^)]+)\))?/)
      if (depMatch) {
        const name = depMatch[1]
        // Remove trailing ! if present
        const cleanName = name.replace(/!$/, '')
        const specifier = depMatch[2] || '*'
        dependencies[cleanName] = specifier
      }
    }
  }

  return { specs, dependencies }
}

/**
 * Parse Ruby dependencies from Gemfile and Gemfile.lock
 */
export const parseRubyDependencies = async (
  project: DenvigProject,
): Promise<ProjectDependencySchema[]> => {
  const gemfilePath = `${project.path}/Gemfile`
  const lockfilePath = `${project.path}/Gemfile.lock`

  if (!existsSync(gemfilePath)) {
    return []
  }

  const data: Map<string, ProjectDependencySchema> = new Map()
  const directDependencyNames: Set<string> = new Set()

  // Parse Gemfile for direct dependencies
  const gemfileContent = readFileSync(gemfilePath, 'utf-8')
  const gemfileDeps = parseGemfile(gemfileContent)

  // Helper to add or update a dependency
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
      const sources = existing.versions[resolvedVersion] || {}
      sources[source] = specifier
      existing.versions[resolvedVersion] = sources
    } else {
      data.set(id, {
        id,
        name,
        ecosystem,
        versions: { [resolvedVersion]: { [source]: specifier } },
      })
    }
  }

  // Add bundler as a system dependency
  data.set('rubygems:bundler', {
    id: 'rubygems:bundler',
    name: 'bundler',
    ecosystem: 'system',
    versions: {},
  })

  for (const dep of gemfileDeps) {
    directDependencyNames.add(dep.name)
  }

  // If lockfile exists, use it for resolved versions
  if (existsSync(lockfilePath)) {
    const lockfileContent = readFileSync(lockfilePath, 'utf-8')
    const lockData = parseGemfileLock(lockfileContent)

    // Add direct dependencies with their resolved versions
    for (const dep of gemfileDeps) {
      const spec = lockData.specs[dep.name]
      if (spec) {
        addDependency(
          `rubygems:${dep.name}`,
          dep.name,
          'rubygems',
          spec.version,
          `.#${dep.group}`,
          dep.specifier,
        )
      }
    }

    // Add transitive dependencies
    for (const [gemName, spec] of Object.entries(lockData.specs)) {
      // Skip if it's a direct dependency
      if (directDependencyNames.has(gemName)) {
        continue
      }

      // Find parent gems that depend on this one
      for (const [parentName, parentSpec] of Object.entries(lockData.specs)) {
        if (parentSpec.dependencies[gemName]) {
          const source = `Gemfile.lock:${parentName}@${parentSpec.version}`
          const depSpecifier = parentSpec.dependencies[gemName]
          addDependency(
            `rubygems:${gemName}`,
            gemName,
            'rubygems',
            spec.version,
            source,
            depSpecifier,
          )
        }
      }
    }
  } else {
    // No lockfile - add direct dependencies without resolved versions
    for (const dep of gemfileDeps) {
      addDependency(
        `rubygems:${dep.name}`,
        dep.name,
        'rubygems',
        dep.specifier,
        `.#${dep.group}`,
        dep.specifier,
      )
    }
  }

  return Array.from(data.values()).sort((a, b) => a.name.localeCompare(b.name))
}
