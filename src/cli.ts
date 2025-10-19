#!/usr/bin/env node

import parseArgs from 'minimist'

import { getGlobalConfig } from './lib/config.ts'
import { DenvigProject } from './lib/project.ts'
import { getDenvigVersion } from './lib/version.ts'

import type { GenericCommand } from './lib/command.ts'

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

// Main CLI execution
async function main() {
  let commandName = process.argv[2]
  let args = process.argv.slice(2)

  // If inside a valid folder, get the project slug from the current directory
  const globalConfig = getGlobalConfig()
  const currentDir = process.cwd()
  const projectSlug =
    parseArgs(process.argv.slice(2)).project?.toString() ||
    currentDir
      .replace(`${globalConfig.codeRootDir}/`, '')
      .split('/')
      .slice(0, 2)
      .join('/')
  const project = new DenvigProject(projectSlug)

  // Quick actions
  const quickActions = [
    ...(globalConfig.quickActions || []),
    ...(project?.config?.quickActions || []),
  ].sort()
  if (quickActions.includes(commandName as (typeof quickActions)[number])) {
    args = ['run', ...process.argv.slice(2)]
    commandName = 'run'
    console.log('> Proxying to denvig run', ...process.argv.slice(2))
  }

  const { runCommand } = await import('./commands/run.ts')
  const { configCommand } = await import('./commands/config.ts')
  const { pluginsCommand } = await import('./commands/plugins.ts')
  const { versionCommand } = await import('./commands/version.ts')
  const { infoCommand } = await import('./commands/info.ts')
  const { servicesCommand } = await import('./commands/services.ts')
  const { startCommand } = await import('./commands/start.ts')
  const { stopCommand } = await import('./commands/stop.ts')
  const { restartCommand } = await import('./commands/restart.ts')
  const { statusCommand } = await import('./commands/status.ts')
  const { internalsResourceHashCommand, internalsResourceIdCommand } =
    await import('./commands/internals.ts')

  const commands = {
    run: runCommand,
    config: configCommand,
    plugins: pluginsCommand,
    version: versionCommand,
    info: infoCommand,
    services: servicesCommand,
    start: startCommand,
    stop: stopCommand,
    restart: restartCommand,
    status: statusCommand,
    'internals:resource-hash': internalsResourceHashCommand,
    'internals:resource-id': internalsResourceIdCommand,
  } as Record<string, GenericCommand>

  const command = commands[commandName]
  const flags = parseArgs(args)
  const parsedArgs =
    command?.args.reduce(
      (acc, arg, index) => {
        const value = flags._[index + 1]
        if (value !== undefined) {
          acc[arg.name] = value
        } else if (arg.required) {
          console.error(`Missing required argument: ${arg.name}`)
          process.exit(1)
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
        process.exit(1)
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

  if (!commandName) {
    const padLength = 20
    console.log(`Denvig v${getDenvigVersion()}`)
    console.log('')
    console.log('Usage: denvig <command> [args] [flags]')
    console.log('')
    console.log('Available commands:')
    Object.keys(commands).forEach((cmd) => {
      if (cmd.startsWith('internals:')) return
      console.log(
        `  - ${commands[cmd].usage.padEnd(padLength, ' ')} ${commands[cmd].description}`,
      )
    })
    console.log('')
    console.log('Quick Actions:')
    for (const actionName of quickActions) {
      const actions = (await project?.actions)?.[actionName]
      if (!actions) {
        console.log(`  - ${actionName.padEnd(padLength, ' ')} not defined`)
        return
      }

      for (const action of actions) {
        const lines = action.split('\n')
        const firstLine = lines[0]
        const remainingLines = lines.slice(1)

        console.log(`  - ${actionName.padEnd(padLength, ' ')} $ ${firstLine}`)
        for (const line of remainingLines) {
          if (line.trim()) {
            console.log(`${' '.repeat(padLength + 7)}${line}`)
          }
        }
      }
    }
    console.log('')
    console.log('Global flags:')
    globalFlags.forEach((flag) => {
      console.log(`  --${flag.name.padEnd(padLength, ' ')} ${flag.description}`)
    })
    process.exit(1)
  }

  if (!commands[commandName]) {
    console.error(`Command "${commandName}" not found.`)
    process.exit(1)
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
      process.exit(1)
    }
  } catch (e: unknown) {
    console.error(`Error executing command "${commandName}":`, e)
    process.exit(1)
  }
}

// Run main function when this module is executed directly
main()
