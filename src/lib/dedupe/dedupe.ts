import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { VersionMap } from './optimise.ts'

type ParsedDedupe = {
  dependencies: Record<
    string,
    {
      versions: VersionMap
      optimisedVersions?: VersionMap
    }
  >
}

export type DedupeAnalysis = {
  totalDependencies: number
  optimisedDependencies: number
  removals: Record<string, string[]>
  details: Array<{
    name: string
    versions: string[]
    optimisedVersions: string[]
  }>
}

/**
 * Analyze parsed lockfile data and determine what can be deduplicated.
 */
export const analyzeDedupeFromParsed = (
  parsed: ParsedDedupe,
): DedupeAnalysis => {
  let totalDependencies = 0
  let optimisedDependencies = 0
  const removals: Record<string, string[]> = {}
  const details: DedupeAnalysis['details'] = []

  for (const [name, info] of Object.entries(parsed.dependencies)) {
    const versions = Object.keys(info.versions)
    const optimisedVersions = Object.keys(info.optimisedVersions || {})
    totalDependencies += versions.length
    optimisedDependencies += optimisedVersions.length

    if (versions.length !== optimisedVersions.length) {
      const toRemove = versions.filter((v) => !optimisedVersions.includes(v))
      removals[name] = toRemove
      details.push({ name, versions, optimisedVersions })
    }
  }

  return { totalDependencies, optimisedDependencies, removals, details }
}

/**
 * Write updated lockfile content and run package manager install.
 */
export const applyDedupeChanges = async (
  lockfilePath: string,
  newContent: string,
  packageManager: string,
): Promise<void> => {
  await writeFile(lockfilePath, newContent, 'utf-8')

  await new Promise<void>((resolve, reject) => {
    const install = spawn(packageManager, ['install'], {
      cwd: dirname(lockfilePath),
      stdio: 'inherit',
      shell: true,
    })

    install.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${packageManager} install failed with code ${code}`))
      }
    })
  })
}
