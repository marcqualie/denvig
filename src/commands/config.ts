import { stringify } from 'jsr:@std/yaml/stringify'

import { Command } from '../lib/command.ts'
import { getGlobalConfig } from '../lib/config.ts'

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

    console.log('Global:')
    stringify(globalConfig, {
      indent: 2,
      lineWidth: 80,
    })
      .split('\n')
      .forEach((line) => {
        console.log(`  ${line}`)
      })

    console.log('')
    console.log('Project:')
    stringify(projectConfig, {
      indent: 2,
      lineWidth: 80,
    })
      .split('\n')
      .forEach((line) => {
        console.log(`  ${line}`)
      })

    return { success: true, message: 'Configuration displayed.' }
  },
})
