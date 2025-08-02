import { stringify } from 'jsr:@std/yaml/stringify'

import { Command } from '../lib/command.ts'
import { GLOBAL_CONFIG_PATH, getGlobalConfig } from '../lib/config.ts'
import { prettyPath } from '../lib/path.ts'

const printConfig = (config: Record<string, unknown>) => {
  stringify(config, {
    indent: 2,
    lineWidth: 80,
  })
    .trim()
    .split('\n')
    .map((line) => console.log(`  ${prettyPath(line)}`))
}

export const configCommand = new Command({
  name: 'config',
  description: 'Display the current global and project configuration.',
  usage: 'config',
  example: 'config',
  args: [],
  flags: [],
  handler: async (project) => {
    const globalConfig = getGlobalConfig()
    const projectConfig = project.config

    console.log('Denvig Config')
    console.log('')

    console.log(`Global: (${prettyPath(GLOBAL_CONFIG_PATH)})`)
    printConfig(globalConfig)

    console.log('')
    console.log('Project:')
    console.log(`  slug: ${project.slug}`)
    printConfig(projectConfig)

    return { success: true, message: 'Configuration displayed.' }
  },
})
