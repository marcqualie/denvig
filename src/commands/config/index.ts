import { stringify } from 'yaml'

import { Command } from '../../lib/command.ts'
import { getGlobalConfig } from '../../lib/config.ts'
import { prettyPath } from '../../lib/path.ts'
import { configVerifyCommand } from './verify.ts'

const printConfig = (config: Record<string, unknown>) => {
  const configWithoutUndefined = Object.fromEntries(
    Object.entries({ ...config, $sources: undefined }).filter(
      ([_, value]) => value !== undefined,
    ),
  )

  stringify(configWithoutUndefined, {
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
  subcommands: {
    verify: configVerifyCommand,
  },
  handler: ({ project, flags }) => {
    const globalConfig = getGlobalConfig()
    const projectConfig = project.config

    if (flags.json) {
      const { $sources: globalSources, ...globalConfigWithoutSources } =
        globalConfig
      const { $sources: projectSources, ...projectConfigWithoutSources } =
        projectConfig
      console.log(
        JSON.stringify({
          global: {
            sources: globalSources,
            config: globalConfigWithoutSources,
          },
          project: {
            slug: project.slug,
            sources: projectSources,
            config: projectConfigWithoutSources,
          },
        }),
      )
      return { success: true, message: 'Configuration displayed.' }
    }

    console.log('Denvig Config')
    console.log('')

    console.log(
      `Global: ${globalConfig.$sources.map((path) => prettyPath(path)).join(', ') || 'default'}`,
    )
    printConfig(globalConfig)

    console.log('')
    console.log(
      `Project: ${project.config.$sources.map((path) => prettyPath(path)).join(', ') || 'default'}`,
    )
    console.log(`  slug: ${project.slug}`)
    printConfig(projectConfig)

    return { success: true, message: 'Configuration displayed.' }
  },
})
