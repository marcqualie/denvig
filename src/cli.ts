import { parse } from 'https://deno.land/std@0.203.0/flags/mod.ts'

import { getGlobalConfig } from './lib/config.ts'
import { DenvigProject } from './lib/project.ts'
import { getDenvigVersion } from './lib/version.ts'

import type { GenericCommand } from './lib/command.ts'

/**
 * Root aliases are convenient helpers to avoid typing `run` all the time.
 */
const rootRunAliases = [
  'build',
  'check-types',
  'dev',
  'install',
  'lint',
  'outdated',
  'test',
] as const

// Global flags that are available for all commands
const globalFlags = [
  {
    name: 'project',
    description:
      'The project slug to run against. Defaults to current directory.',
    required: false,
    type: 'string',
    defaultValue: undefined,
  },
]

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  let commandName = Deno.args[0]
  let args = Deno.args

  // Quick access aliases
  if (rootRunAliases.includes(commandName as (typeof rootRunAliases)[number])) {
    args = ['run', ...Deno.args]
    commandName = 'run'
  }

  const flags = parse(args)
  const commands = {
    run: (await import('./commands/run.ts')).runCommand,
    config: (await import('./commands/config.ts')).configCommand,
    version: (await import('./commands/version.ts')).versionCommand,
  } as Record<string, GenericCommand>

  const command = commands[commandName]
  const parsedArgs =
    command?.args.reduce(
      (acc, arg, index) => {
        const value = flags._[index + 1]
        if (value !== undefined) {
          acc[arg.name] = value
        } else if (arg.required) {
          console.error(`Missing required argument: ${arg.name}`)
          Deno.exit(1)
        }
        return acc
      },
      {} as Record<string, string | number>,
    ) || {}

  // Extract extra arguments that weren't consumed by the command definition
  const extraPositionalArgs =
    flags._.slice(command?.args.length + 1).map((arg) => String(arg)) || []

  const allFlags = [...globalFlags, ...(command?.flags || [])]
  const recognizedFlagNames = new Set(allFlags.map((flag) => flag.name))

  const parsedFlags = allFlags.reduce(
    (acc, flag) => {
      if (flags[flag.name] !== undefined) {
        acc[flag.name] = flags[flag.name]
      } else if (flag.defaultValue !== undefined) {
        acc[flag.name] = flag.defaultValue
      } else if (flag.required) {
        console.error(`Missing required flag: ${flag.name}`)
        Deno.exit(1)
      }
      return acc
    },
    {} as Record<string, string | number | boolean>,
  )

  // Extract unrecognized flags and convert them to command line arguments
  const extraFlagArgs: string[] = []
  for (const [key, value] of Object.entries(flags)) {
    if (key !== '_' && !recognizedFlagNames.has(key)) {
      if (value === true) {
        extraFlagArgs.push(`--${key}`)
      } else if (value === false) {
        extraFlagArgs.push(`--no-${key}`)
      } else {
        extraFlagArgs.push(`--${key}`, String(value))
      }
    }
  }

  // Combine extra positional args and extra flag args
  const extraArgs = [...extraPositionalArgs, ...extraFlagArgs]

  // If inside a valid folder, get the project slug from the current directory
  const globalConfig = getGlobalConfig()
  const currentDir = Deno.cwd()
  const projectSlug =
    parsedFlags.project?.toString() ||
    currentDir
      .replace(`${globalConfig.codeRootDir}/`, '')
      .split('/')
      .slice(0, 2)
      .join('/')
  const project = new DenvigProject(projectSlug)

  if (!commandName) {
    console.log(`Denvig v${getDenvigVersion()}`)
    console.log('')
    console.log('Usage: denvig <command> [args] [flags]')
    console.log('')
    console.log('Available commands:')
    Object.keys(commands).forEach((cmd) => {
      console.log(
        `  - ${commands[cmd].usage.padEnd(19, ' ')} ${commands[cmd].description}`,
      )
    })
    console.log('')
    console.log('Root Actions:')
    rootRunAliases.forEach((alias) => {
      const action = project?.actions?.[alias]
      console.log(
        `  - ${alias.padEnd(19, ' ')} ${action ? `$ ${action}` : 'not defined'}`,
      )
    })
    console.log('')
    console.log('Global flags:')
    globalFlags.forEach((flag) => {
      console.log(`  --${flag.name.padEnd(19, ' ')} ${flag.description}`)
    })
    Deno.exit(1)
  }

  if (!commands[commandName]) {
    console.error(`Command "${commandName}" not found.`)
    Deno.exit(1)
  }

  try {
    if (!projectSlug) {
      console.error('No project provided or detected.')
    }

    const { success } = await command.run(
      project,
      parsedArgs,
      parsedFlags,
      extraArgs,
    )
    if (!success) {
      // console.error(`Command "${commandName}" failed.`)
      Deno.exit(1)
    }
  } catch (e: unknown) {
    console.error(`Error executing command "${commandName}":`, e)
    Deno.exit(1)
  }
}
