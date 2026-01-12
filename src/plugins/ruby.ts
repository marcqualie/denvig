import fs from 'node:fs'

import { definePlugin } from '../lib/plugin.ts'
import { rubygemsOutdated } from '../lib/rubygems/outdated.ts'
import { parseRubyDependencies } from '../lib/rubygems/parse.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { DenvigProject } from '../lib/project.ts'

const plugin = definePlugin({
  name: 'ruby',

  actions: async (project: DenvigProject) => {
    const rootFiles = fs.readdirSync(project.path)
    const hasGemfile = rootFiles.includes('Gemfile')
    const hasRakefile = rootFiles.includes('Rakefile')
    const hasConfigRu = rootFiles.includes('config.ru')
    const hasRailsApp = fs.existsSync(`${project.path}/config/application.rb`)

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
    return parseRubyDependencies(project)
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
