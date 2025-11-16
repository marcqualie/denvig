import type { ProjectDependencySchema } from './dependencies'
import type { DenvigProject } from './project'

type PluginOptions = {
  name: string

  actions: (project: DenvigProject) => Promise<Record<string, string[]>>

  dependencies?: (project: DenvigProject) => Promise<ProjectDependencySchema[]>
}

export const definePlugin = (options: PluginOptions) => {
  return options
}
