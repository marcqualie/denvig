import { resolve } from 'node:path'
import { parse } from 'yaml'

import { Command } from '../../lib/command.ts'
import { safeReadTextFileSync } from '../../lib/safeReadFile.ts'
import { ProjectConfigSchema } from '../../schemas/config.ts'

export const configVerifyCommand = new Command({
  name: 'config:verify',
  description: 'Verify a .denvig.yml file against the config schema.',
  usage: 'config verify [path]',
  example: 'config verify .denvig.yml',
  args: [
    {
      name: 'path',
      description: 'Path to the config file (defaults to .denvig.yml)',
      required: false,
      type: 'string' as const,
      defaultValue: '.denvig.yml',
    },
  ],
  flags: [],
  handler: ({ project, args }) => {
    const configPath = resolve(
      project.path,
      args.path?.toString() || '.denvig.yml',
    )
    const configRaw = safeReadTextFileSync(configPath)

    if (!configRaw) {
      console.error(`Config file not found: ${configPath}`)
      return { success: false, message: 'Config file not found.' }
    }

    let parsedYaml: unknown
    try {
      parsedYaml = parse(configRaw)
    } catch (e) {
      console.error(`Failed to parse YAML at ${configPath}:`)
      if (e instanceof Error) {
        console.error(`  ${e.message}`)
      }
      return { success: false, message: 'Invalid YAML syntax.' }
    }

    const result = ProjectConfigSchema.safeParse(parsedYaml)

    if (!result.success) {
      console.error(`Config validation failed for ${configPath}:`)
      for (const issue of result.error.issues) {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
        console.error(`  - ${path}: ${issue.message}`)
      }
      return { success: false, message: 'Config validation failed.' }
    }

    console.log(`Config is valid: ${configPath}`)
    return { success: true, message: 'Config is valid.' }
  },
})
