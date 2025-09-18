import fs from 'node:fs'

import { definePlugin } from '../lib/plugin.ts'

import type { DenvigProject } from '../lib/project.ts'

const plugin = definePlugin({
  name: 'uv',

  actions: async (project: DenvigProject) => {
    const rootFiles = fs.readdirSync(project.path)
    const hasPyProject = rootFiles.includes('pyproject.toml')
    const hasUvLock = rootFiles.includes('uv.lock')
    const canHandle = hasUvLock || hasPyProject

    if (!canHandle) {
      return {}
    }

    const actions: Record<string, string[]> = {
      install: ['uv sync'],
    }

    return actions
  },
})

export default plugin
