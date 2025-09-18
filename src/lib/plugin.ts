import type { DenvigProject } from './project'

type PluginOptions = {
  name: string

  actions: (project: DenvigProject) => Promise<Record<string, string[]>>
}

export const definePlugin = (options: PluginOptions) => {
  return options
}
