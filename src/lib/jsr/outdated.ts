import { extractDepInfo, findWantedVersion } from '../npm/outdated.ts'
import { fetchJsrPackageInfo } from './info.ts'

import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from '../dependencies.ts'
import type { OutdatedDependenciesOptions } from '../plugin.ts'

/**
 * Check JSR packages for outdated versions.
 * Takes a list of jsr-ecosystem dependencies and returns info about which are outdated.
 */
export const jsrOutdated = async (
  dependencies: ProjectDependencySchema[],
  options: OutdatedDependenciesOptions = {},
): Promise<OutdatedDependencySchema[]> => {
  const useCache = options.cache ?? true
  const result: OutdatedDependencySchema[] = []

  const directDeps = dependencies.filter((dep) => {
    return dep.versions.some(
      (v) =>
        v.source.includes('#dependencies') ||
        v.source.includes('#devDependencies'),
    )
  })

  const fetchPromises = directDeps.map(async (dep) => {
    const info = extractDepInfo(dep)
    if (!info) return

    const jsrInfo = await fetchJsrPackageInfo(dep.name, !useCache)
    if (!jsrInfo) return

    // Handle wildcard specifier: wanted = latest
    const wanted =
      info.specifier === '*'
        ? jsrInfo.latest
        : findWantedVersion(jsrInfo.versions, info.specifier)
    const latest = jsrInfo.latest

    const hasWantedUpdate = wanted && wanted !== info.current
    const hasLatestUpdate = latest && latest !== info.current

    if (hasWantedUpdate || hasLatestUpdate) {
      result.push({
        ...dep,
        wanted: wanted || info.current,
        latest: latest,
        specifier: info.specifier,
        isDevDependency: info.isDevDependency,
      })
    }
  })

  await Promise.all(fetchPromises)

  return result
}
