#!/usr/bin/env node

import parseArgs from 'minimist'

import { expandTilde, getGlobalConfig } from './lib/config.ts'
import { DenvigProject } from './lib/project.ts'
import { resolveProjectId } from './lib/project-id.ts'
import { listProjects } from './lib/projects.ts'
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
  {
    name: 'json',
    description: 'Output in JSON format',
    required: false,
    type: 'boolean',
    defaultValue: false,
  },
]

// Main CLI execution
async function main() {
  let commandName = process.argv[2]
  let args = process.argv.slice(2)

  // Detect project from current directory or --project flag
  const globalConfig = getGlobalConfig()
  const currentDir = process.cwd()
  const projectFlag = parseArgs(process.argv.slice(2)).project?.toString()

  // Find project path: either from flag, or detect from current directory
  let projectPath: string | null = null

  if (projectFlag) {
    // Use the unified project ID resolver
    const resolved = resolveProjectId(projectFlag, expandTilde)
    projectPath = resolved.path
  } else {
    // Check if current directory matches any projectPaths pattern
    const projects = listProjects()
    const match = projects.find(
      (p) => currentDir === p.path || currentDir.startsWith(`${p.path}/`),
    )
    if (match) {
      projectPath = match.path
    } else {
      // Fall back to current directory
      projectPath = currentDir
    }
  }

  const project = projectPath ? new DenvigProject(projectPath) : null

  // Command aliases - map shortcuts to their full commands
  const commandAliases: Record<string, string> = {
    outdated: 'deps:outdated',
  }
  if (commandAliases[commandName]) {
    commandName = commandAliases[commandName]
  }

  // Handle services subcommands (e.g., "services start" -> "services:start")
  const servicesSubcommands = [
    'start',
    'stop',
    'restart',
    'status',
    'logs',
    'teardown',
  ]
  if (commandName === 'services') {
    const subcommand = process.argv[3]
    if (subcommand && servicesSubcommands.includes(subcommand)) {
      commandName = `services:${subcommand}`
      // Remove the subcommand from args so it's not treated as an argument
      args = [process.argv[2], ...process.argv.slice(4)]
    }
  }

  // Handle deps subcommands (e.g., "deps list" -> "deps:list")
  const depsSubcommands = ['list', 'outdated', 'why']
  if (commandName === 'deps') {
    const subcommand = process.argv[3]
    if (subcommand && depsSubcommands.includes(subcommand)) {
      commandName = `deps:${subcommand}`
      // Remove the subcommand from args so it's not treated as an argument
      args = [process.argv[2], ...process.argv.slice(4)]
    }
  }

  // Handle config subcommands (e.g., "config verify" -> "config:verify")
  const configSubcommands = ['verify']
  if (commandName === 'config') {
    const subcommand = process.argv[3]
    if (subcommand && configSubcommands.includes(subcommand)) {
      commandName = `config:${subcommand}`
      // Remove the subcommand from args so it's not treated as an argument
      args = [process.argv[2], ...process.argv.slice(4)]
    }
  }

  // Handle projects subcommands (e.g., "projects list" -> "projects:list")
  const projectsSubcommands = ['list']
  if (commandName === 'projects') {
    const subcommand = process.argv[3]
    if (subcommand && projectsSubcommands.includes(subcommand)) {
      commandName = `projects:${subcommand}`
      // Remove the subcommand from args so it's not treated as an argument
      args = [process.argv[2], ...process.argv.slice(4)]
    }
  }

  // Handle zsh subcommands (e.g., "zsh completions" -> "zsh:completions")
  const zshSubcommands = ['completions', '__complete__']
  if (commandName === 'zsh') {
    const subcommand = process.argv[3]
    if (subcommand && zshSubcommands.includes(subcommand)) {
      commandName = `zsh:${subcommand}`
      // Remove the subcommand from args so it's not treated as an argument
      args = [process.argv[2], ...process.argv.slice(4)]
    }
  }

  // Quick actions
  const quickActions = [
    ...(globalConfig.quickActions ?? []),
    ...(project?.config?.quickActions ?? []),
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
  const { servicesCommand } = await import('./commands/services/list.ts')
  const { servicesStartCommand } = await import('./commands/services/start.ts')
  const { servicesStopCommand } = await import('./commands/services/stop.ts')
  const { servicesRestartCommand } = await import(
    './commands/services/restart.ts'
  )
  const { servicesStatusCommand } = await import(
    './commands/services/status.ts'
  )
  const { logsCommand } = await import('./commands/services/logs.ts')
  const { servicesTeardownCommand } = await import(
    './commands/services/teardown.ts'
  )
  const { internalsResourceHashCommand, internalsResourceIdCommand } =
    await import('./commands/internals.ts')
  const { depsListCommand } = await import('./commands/deps/list.ts')
  const { depsOutdatedCommand } = await import('./commands/deps/outdated.ts')
  const { depsWhyCommand } = await import('./commands/deps/why.ts')
  const { configVerifyCommand } = await import('./commands/config/verify.ts')
  const { projectsListCommand } = await import('./commands/projects/list.ts')
  const { zshCompletionsCommand } = await import(
    './commands/zsh/completions.ts'
  )
  const { zshCompleteCommand } = await import('./commands/zsh/__complete__.ts')

  const commands = {
    run: runCommand,
    config: configCommand,
    'config:verify': configVerifyCommand,
    plugins: pluginsCommand,
    version: versionCommand,
    info: infoCommand,
    services: servicesCommand,
    'services:start': servicesStartCommand,
    'services:stop': servicesStopCommand,
    'services:restart': servicesRestartCommand,
    'services:status': servicesStatusCommand,
    'services:logs': logsCommand,
    'services:teardown': servicesTeardownCommand,
    deps: depsListCommand,
    'deps:list': depsListCommand,
    'deps:outdated': depsOutdatedCommand,
    'deps:why': depsWhyCommand,
    'internals:resource-hash': internalsResourceHashCommand,
    'internals:resource-id': internalsResourceIdCommand,
    projects: projectsListCommand,
    'projects:list': projectsListCommand,
    'zsh:completions': zshCompletionsCommand,
    'zsh:__complete__': zshCompleteCommand,
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
      if (cmd.startsWith('internals:') || cmd === 'zsh:__complete__') return
      // Skip alias entries that duplicate another command
      if (cmd === 'deps' || cmd === 'projects') return
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
    if (!project) {
      console.error('No project provided or detected.')
      process.exit(1)
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
