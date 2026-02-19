import { readFile } from 'node:fs/promises'

import type { DenvigProject } from './project'

export type PackageJson = {
  name: string
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

/**
 * Read the contents of a package.json file in a given project.
 */
export const readPackageJson = async (
  project: DenvigProject,
): Promise<PackageJson | null> => {
  const packageJsonPath = `${project.path}/package.json`
  try {
    const content = await readFile(packageJsonPath, 'utf-8')
    return JSON.parse(content) as PackageJson
  } catch {
    return null
  }
}
