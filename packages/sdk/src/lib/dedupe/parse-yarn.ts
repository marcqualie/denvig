import { optimiseVersions, type VersionMap } from './optimise.ts'

type Dependency = {
  versions: VersionMap
  optimisedVersions?: VersionMap
}

/**
 * Dependencies grouped by name and version.
 */
export type ParsedYarnLock = {
  dependencies: Record<string, Dependency>
}

type ParsedNativeDependency = {
  version: string
  resolved: string
}

type ParsedNativeLockfile = {
  type: string
  object: Record<string, ParsedNativeDependency>
}

/**
 * Mimic the native parsing of the yarn.lock file.
 */
const nativeParse = (content: string): ParsedNativeLockfile => {
  const blocks = content.split('\n\n')
  const dependencies: Record<string, ParsedNativeDependency> = {}
  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length < 3) continue
    const definitions = lines[0]
      .split(',')
      .map((definition) => definition.trim().replace(/"|:/g, ''))
    const version = lines[1]?.match(/version "(.+)"/)?.[1]
    const resolved = lines[2]?.match(/resolved "(.+)"/)?.[1]
    if (!version || !resolved) continue

    for (const definition of definitions) {
      if (!definition) continue
      dependencies[definition] = { version, resolved }
    }
  }
  return { type: 'success', object: dependencies }
}

/**
 * Parse yarn.lock content for deduplication analysis.
 */
export const parseYarnLockForDedupe = (content: string): ParsedYarnLock => {
  const dependencies: Record<string, Dependency> = {}
  const nativeParsed = nativeParse(content)

  for (const [dependencyDefinition, dependencyConfig] of Object.entries(
    nativeParsed.object,
  )) {
    const pattern = /^(@?.+)@(.+)$/
    const [, dependencyName, targetVersion] =
      dependencyDefinition.match(pattern) || []

    if (!dependencies[dependencyName]) {
      dependencies[dependencyName] = { versions: {} }
    }
    if (!dependencies[dependencyName].versions[dependencyConfig.version]) {
      dependencies[dependencyName].versions[dependencyConfig.version] = []
    }

    dependencies[dependencyName].versions[dependencyConfig.version] = [
      ...dependencies[dependencyName].versions[dependencyConfig.version],
      targetVersion,
    ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    dependencies[dependencyName].versions = Object.fromEntries(
      Object.entries(dependencies[dependencyName].versions).sort((a, b) =>
        a[0].localeCompare(b[0], undefined, { numeric: true }),
      ),
    )
  }

  for (const [dependency, config] of Object.entries(dependencies)) {
    dependencies[dependency].optimisedVersions = optimiseVersions(
      config.versions,
    )
  }

  return { dependencies }
}
