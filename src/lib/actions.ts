import { existsSync } from 'https://deno.land/std@0.224.0/fs/exists.ts'

import type { DenvigProject } from './project.ts'

type Actions = Record<string, string>

/**
 * Return the actions from combined sources.
 *
 * Actions are built in order of priority, highest first:
 * - Project defined actions
 * - Globally defined actions (TODO)
 * - deno.json tasks
 * - package.json scripts
 */
export const detectActions = (project: DenvigProject): Actions => {
  const dependencies = project.dependencies

  let actions: Record<string, string> = {}

  // Project
  if (project.config.actions) {
    actions = {
      ...actions,
      ...Object.entries(project.config.actions).reduce((acc, [key, value]) => {
        acc[key] = value.command
        return acc
      }, {} as Actions),
    }
  }

  // Deno
  if (dependencies.some((dep) => dep.name === 'deno')) {
    const denoJson = existsSync(`${project.path}/deno.json`)
      ? JSON.parse(Deno.readTextFileSync(`${project.path}/deno.json`))
      : existsSync(`${project.path}/deno.jsonc`)
        ? JSON.parse(Deno.readTextFileSync(`${project.path}/deno.jsonc`))
        : {}
    const tasks = (denoJson.tasks || {}) as Record<string, string>
    actions = mergeActions(actions, {
      ...actions,
      test: tasks?.test ? `deno task test` : 'deno test',
      lint: tasks?.lint ? `deno task lint` : 'deno lint',
      'check-types': tasks?.checkTypes ? `deno task check-types` : 'deno check',
      ...Object.entries(tasks).reduce(
        (acc, [key, value]) => {
          acc[key] = value.startsWith('deno') ? value : `deno task ${key}`
          return acc
        },
        {} as Record<string, string>,
      ),
      install: 'deno install',
      outdated: 'deno outdated',
    })
  }

  // NPM / PNPM / Yarn
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
    actions = mergeActions(actions, {
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
    })
  }

  return actions
}

/**
 * Combine two actions maps. Existing actions should not be overwritten.
 */
const mergeActions = (actions: Actions, newActions: Actions): Actions => {
  for (const [key, value] of Object.entries(newActions)) {
    if (!actions[key]) {
      actions[key] = value
    }
  }
  return actions
}
