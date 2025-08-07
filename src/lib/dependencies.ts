import { existsSync, readFileSync } from 'node:fs'

import type { ProjectSchema } from '../schemas/project.ts'
import type { DenvigProject } from './project.ts'

export const detectDependencies = (
  project: DenvigProject,
): ProjectSchema['dependencies'] => {
  const dependencies: ProjectSchema['dependencies'] = []

  if (existsSync(`${project.path}/package.json`)) {
    dependencies.push({
      id: 'npm:npm',
      name: 'npm',
      ecosystem: 'system',
      versions: [],
    })
    const packageJson = JSON.parse(
      readFileSync(`${project.path}/package.json`, 'utf8'),
    )
    if (packageJson.dependencies) {
      for (const [name, versions] of Object.entries({
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      })) {
        dependencies.push({
          id: `npm:${name}`,
          name,
          ecosystem: 'npm',
          versions: Array.isArray(versions) ? versions : [versions],
        })
      }
    }
  }
  if (existsSync(`${project.path}/yarn.lock`)) {
    dependencies.push({
      id: 'npm:yarn',
      name: 'yarn',
      ecosystem: 'system',
      versions: [],
    })
  }
  if (existsSync(`${project.path}/pnpm-lock.yaml`)) {
    dependencies.push({
      id: 'npm:pnpm',
      name: 'pnpm',
      ecosystem: 'system',
      versions: [],
    })
  }
  if (
    existsSync(`${project.path}/deno.json`) ||
    existsSync(`${project.path}/deno.jsonc`)
  ) {
    dependencies.push({
      id: 'deno:deno',
      name: 'deno',
      ecosystem: 'system',
      versions: [process.version],
    })
  }

  return dependencies
}
