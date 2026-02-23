import { resolve } from 'node:path'
import { parse } from 'yaml'

import { Command } from '../../lib/command.ts'
import { safeReadTextFile } from '../../lib/safeReadFile.ts'
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
  handler: async ({ project, args, flags }) => {
    const configPath = resolve(
      project.path,
      args.path?.toString() || '.denvig.yml',
    )
    const configRaw = await safeReadTextFile(configPath)

    if (!configRaw) {
      if (flags.json) {
        console.log(
          JSON.stringify({
            valid: false,
            path: configPath,
            error: 'Config file not found.',
          }),
        )
      } else {
        console.error(`Config file not found: ${configPath}`)
      }
      return { success: false, message: 'Config file not found.' }
    }

    let parsedYaml: unknown
    try {
      parsedYaml = parse(configRaw)
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      if (flags.json) {
        console.log(
          JSON.stringify({
            valid: false,
            path: configPath,
            error: `Invalid YAML syntax: ${errorMessage}`,
          }),
        )
      } else {
        console.error(`Failed to parse YAML at ${configPath}:`)
        console.error(`  ${errorMessage}`)
      }
      return { success: false, message: 'Invalid YAML syntax.' }
    }

    const result = ProjectConfigSchema.safeParse(parsedYaml)

    if (!result.success) {
      if (flags.json) {
        console.log(
          JSON.stringify({
            valid: false,
            path: configPath,
            errors: result.error.issues.map((issue) => ({
              path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
              message: issue.message,
            })),
          }),
        )
      } else {
        console.error(`Config validation failed for ${configPath}:`)
        for (const issue of result.error.issues) {
          const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
          console.error(`  - ${path}: ${issue.message}`)
        }
      }
      return { success: false, message: 'Config validation failed.' }
    }

    if (flags.json) {
      console.log(JSON.stringify({ valid: true, path: configPath }))
    } else {
      console.log(`Config is valid: ${configPath}`)
    }
    return { success: true, message: 'Config is valid.' }
  },
})
