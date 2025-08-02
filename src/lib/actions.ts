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
    return {
      build: denoJson.tasks?.build,
      test: denoJson.tasks?.test || 'deno test',
      lint: denoJson.tasks?.lint || 'deno lint',
      ...denoJson.tasks,
      install: 'deno install',
      outdated: 'deno outdated',
    }
  }

  if (dependencies.some((dep) => dep.name === 'npm')) {
    const packageJson = JSON.parse(
      Deno.readTextFileSync(`${project.path}/package.json`),
    )
    let packageManager = 'npm'
    if (existsSync(`${project.path}/pnpm-lock.yaml`)) {
      packageManager = 'pnpm'
    } else if (existsSync(`${project.path}/yarn.lock`)) {
      packageManager = 'yarn'
    }
    return {
      build: `${packageManager} ${packageJson.scripts?.build || 'run build'}`,
      test: `${packageManager} ${packageJson.scripts?.test || 'run test'}`,
      lint: `${packageManager} ${packageJson.scripts?.lint || 'run lint'}`,
      dev: `${packageManager} ${packageJson.scripts?.dev || 'run dev'}`,
      install: `${packageManager} install`,
      outdated: `${packageManager} outdated`,
    }
  }

  return {}
}
