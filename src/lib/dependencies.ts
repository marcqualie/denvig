import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'

import type { DenvigProject } from './project.ts'

export const ProjectDependencySchema = z.object({
  id: z.string().describe('Unique identifier for the ecosystem / dependency'),
  name: z.string().describe('Name of the dependency'),
  versions: z
    .record(z.string(), z.array(z.string()))
    .describe('List of versions available for the dependency'),
  ecosystem: z
    .string()
    .describe('Ecosystem of the dependency (e.g., npm, rubygems, pip)'),
})

export type ProjectDependencySchema = z.infer<typeof ProjectDependencySchema>

export const detectDependencies = (
  project: DenvigProject,
): ProjectDependencySchema[] => {
  const dependencies: ProjectDependencySchema[] = []

  if (existsSync(`${project.path}/package.json`)) {
    dependencies.push({
      id: 'npm:npm',
      name: 'npm',
      ecosystem: 'system',
      versions: {},
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
