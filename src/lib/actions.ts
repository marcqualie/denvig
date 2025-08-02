import { existsSync } from 'https://deno.land/std@0.224.0/fs/exists.ts'

import type { DenvigProject } from './project.ts'

/**
 * TODO: Combine actions from multiple sources
 */
export const detectActions = (
  project: DenvigProject,
): Record<string, string> => {
  const dependencies = project.dependencies

  if (dependencies.some((dep) => dep.name === 'deno')) {
    const denoJson = existsSync(`${project.path}/deno.json`)
      ? JSON.parse(Deno.readTextFileSync(`${project.path}/deno.json`))
      : existsSync(`${project.path}/deno.jsonc`)
        ? JSON.parse(Deno.readTextFileSync(`${project.path}/deno.jsonc`))
        : {}
    const tasks = (denoJson.tasks || {}) as Record<string, string>
    return {
      test: tasks?.test ? `deno task test` : 'deno test',
      lint: tasks?.lint ? `deno task lint` : 'deno lint',
      ...Object.entries(tasks).reduce(
        (acc, [key, value]) => {
          acc[key] = value.startsWith('deno') ? value : `deno task ${key}`
          return acc
        },
        {} as Record<string, string>,
      ),
      install: 'deno install',
      outdated: 'deno outdated',
    }
  }

  if (dependencies.some((dep) => dep.name === 'npm')) {
    const packageJson = JSON.parse(
      Deno.readTextFileSync(`${project.path}/package.json`),
    )
    const scripts = (packageJson.scripts || {}) as Record<string, string>
    let packageManager = 'npm'
    if (existsSync(`${project.path}/pnpm-lock.yaml`)) {
      packageManager = 'pnpm'
    } else if (existsSync(`${project.path}/yarn.lock`)) {
      packageManager = 'yarn'
    }
    return {
      build: `${packageManager} ${scripts.build || 'run build'}`,
      test: `${packageManager} ${scripts.test || 'run test'}`,
      lint: `${packageManager} ${scripts.lint || 'run lint'}`,
      dev: `${packageManager} ${scripts.dev || 'run dev'}`,
      ...Object.entries(scripts).reduce(
        (acc, [key, value]) => {
          acc[key] = value.startsWith(packageManager)
            ? value
            : `${packageManager} run ${key}`
          return acc
        },
        {} as Record<string, string>,
      ),
      install: `${packageManager} install`,
      outdated: `${packageManager} outdated`,
    }
  }

  return {}
}
