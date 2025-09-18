import fs, { existsSync, readFileSync } from 'node:fs'

import { mergeActions } from '../lib/actions/mergeActions.ts'
import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { DenvigProject } from '../lib/project.ts'

const plugin = definePlugin({
  name: 'deno',

  actions: async (project: DenvigProject) => {
    const rootFiles = fs.readdirSync(project.path)
    const hasDenoConfig =
      rootFiles.includes('deno.json') || rootFiles.includes('deno.jsonc')

    if (!hasDenoConfig) {
      return {}
    }

    const packageJson = readPackageJson(project)
    const scripts = packageJson?.scripts || ({} as Record<string, string>)
    let actions: Record<string, string[]> = {
      ...Object.entries(scripts)
        .map(([key, script]) => [key, `deno ${script}`])
        .reduce(
          (acc, [key, script]) => {
            acc[key] = [script]
            return acc
          },
          {} as Record<string, string[]>,
        ),
      install: ['deno install'],
      outdated: ['deno outdated'],
    }

    const denoJson = existsSync(`${project.path}/deno.json`)
      ? JSON.parse(readFileSync(`${project.path}/deno.json`, 'utf8'))
      : existsSync(`${project.path}/deno.jsonc`)
        ? JSON.parse(readFileSync(`${project.path}/deno.jsonc`, 'utf8'))
        : {}
    const tasks = (denoJson.tasks || {}) as Record<string, string>
    actions = mergeActions(actions, {
      test: [tasks?.test ? `deno task test` : 'deno test'],
      lint: [tasks?.lint ? `deno task lint` : 'deno lint'],
      'check-types': [
        tasks?.checkTypes ? `deno task check-types` : 'deno check',
      ],
      ...Object.entries(tasks).reduce(
        (acc, [key, value]) => {
          acc[key] = [value.startsWith('deno') ? value : `deno task ${key}`]
          return acc
        },
        {} as Record<string, string[]>,
      ),
      install: ['deno install'],
      outdated: ['deno outdated'],
    })

    return actions
  },
})

export default plugin
