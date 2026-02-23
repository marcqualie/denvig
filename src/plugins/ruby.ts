import { definePlugin } from '../lib/plugin.ts'
import { rubygemsOutdated } from '../lib/rubygems/outdated.ts'
import { parseRubyDependencies } from '../lib/rubygems/parse.ts'
import { pathExists } from '../lib/safeReadFile.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { DenvigProject } from '../lib/project.ts'

// Cache for parsed dependencies by project path
const dependenciesCache = new Map<string, ProjectDependencySchema[]>()

const plugin = definePlugin({
  name: 'ruby',

  actions: async (project: DenvigProject) => {
    const rootFiles = project.rootFiles
    const hasGemfile = rootFiles.includes('Gemfile')
    const hasRakefile = rootFiles.includes('Rakefile')
    const hasConfigRu = rootFiles.includes('config.ru')
    const hasRailsApp = await pathExists(
      `${project.path}/config/application.rb`,
    )

    const canHandle = hasGemfile || hasRakefile

    if (!canHandle) {
      return {}
    }

    const actions: Record<string, string[]> = {
      install: ['bundle install'],
      update: ['bundle update'],
      outdated: ['bundle outdated'],
    }

    // Add Rails-specific actions if it's a Rails project
    if (hasRailsApp) {
      actions.dev = ['bundle exec rails server']
      actions.repl = ['bundle exec rails console']
    }

    // Add Rack-specific actions if config.ru exists (for non-Rails Rack apps)
    if (hasConfigRu && !hasRailsApp) {
      actions.dev = ['bundle exec rackup']
    }

    return actions
  },

  dependencies: async (
    project: DenvigProject,
  ): Promise<ProjectDependencySchema[]> => {
    const hasGemfile = project.rootFiles.includes('Gemfile')
    if (!hasGemfile) {
      return []
    }

    // Return cached result if available
    const cached = dependenciesCache.get(project.path)
    if (cached) {
      return cached
    }

    const result = await parseRubyDependencies(project)

    // Cache the result for subsequent calls
    dependenciesCache.set(project.path, result)

    return result
  },

  outdatedDependencies: async (project, options) => {
    const hasGemfile = project.rootFiles.includes('Gemfile')
    if (!hasGemfile) {
      return []
    }
    const dependencies = await plugin.dependencies?.(project)
    if (!dependencies) return []
    return rubygemsOutdated(dependencies, options)
  },
})

export default plugin
