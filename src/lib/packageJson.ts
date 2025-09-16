import fs from 'node:fs'

import type { DenvigProject } from './project'

type PackageJson = {
  name: string
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

/**
 * Read the contents of a package.json file in a given project.
 */
export const readPackageJson = (project: DenvigProject): PackageJson | null => {
  const packageJsonPath = `${project.path}/package.json`
  if (!fs.existsSync(packageJsonPath)) {
    return null
  }

  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8')
  return JSON.parse(packageJsonContent) as PackageJson
}
