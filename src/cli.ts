#!/usr/bin/env node

import parseArgs from 'minimist'

import { globalFlags, showCommandHelp, showRootHelp } from './lib/cli-help.ts'
import { createCliLogTracker } from './lib/cli-logs.ts'
import { expandTilde, getGlobalConfig } from './lib/config.ts'
import { getGitHubSlug } from './lib/git.ts'
import { DenvigProject } from './lib/project.ts'
import { resolveProjectId } from './lib/project-id.ts'
import { listProjects } from './lib/projects.ts'
import { getDenvigVersion } from './lib/version.ts'

import type { GenericCommand } from './lib/command.ts'

// Main CLI execution
async function main() {
  let commandName = process.argv[2]
  let args = process.argv.slice(2)
  const rootFlags = parseArgs(args)

  // Handle root-level --version/-v
  if (rootFlags.version || rootFlags.v) {
    console.log(`v${getDenvigVersion()}`)
    process.exit(0)
  }

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

  // Initialize CLI logging (after project detection for slug)
  const slug = projectPath ? getGitHubSlug(projectPath) : null
  const cliLogTracker = createCliLogTracker({
    version: getDenvigVersion(),
    command: `denvig ${process.argv.slice(2).join(' ')}`,
    slug: slug ?? undefined,
    path: process.cwd(),
    via: process.env.DENVIG_CLI_VIA,
  })

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

  // Handle certs subcommands (e.g., "certs init" -> "certs:init")
  const certsSubcommands = ['init', 'list', 'generate', 'import', 'rm']
  if (commandName === 'certs') {
    const subcommand = process.argv[3]
    if (subcommand && certsSubcommands.includes(subcommand)) {
      commandName = `certs:${subcommand}`
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
  const { certsListCommand } = await import('./commands/certs/list.ts')
  const { certsInitCommand } = await import('./commands/certs/init.ts')
  const { certsGenerateCommand } = await import('./commands/certs/generate.ts')
  const { certsImportCommand } = await import('./commands/certs/import.ts')
  const { certsRmCommand } = await import('./commands/certs/rm.ts')

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
    certs: certsListCommand,
    'certs:init': certsInitCommand,
    'certs:list': certsListCommand,
    'certs:generate': certsGenerateCommand,
    'certs:import': certsImportCommand,
    'certs:rm': certsRmCommand,
  } as Record<string, GenericCommand>

  const command = commands[commandName]
  const flags = parseArgs(args)

  // Check if help is requested for this command
  const helpRequested = flags.help || flags.h

  // Parse command arguments
  const parsedArgs: Record<string, string | number> = {}
  let missingArg: string | null = null
  for (const [index, arg] of (command?.args || []).entries()) {
    const value = flags._[index + 1]
    if (value !== undefined) {
      parsedArgs[arg.name] = value
    } else if (arg.required) {
      missingArg = arg.name
      break
    }
  }
  if (missingArg && !helpRequested) {
    const errorMsg = `Missing required argument: ${missingArg}`
    console.error(errorMsg)
    await cliLogTracker.finish(1, errorMsg)
    process.exit(1)
  }

  // Extract extra arguments that weren't consumed by the command definition
  const extraPositionalArgs =
    flags._.slice(command?.args.length + 1).map((arg) => String(arg)) || []

  const allFlags = [...globalFlags, ...(command?.flags || [])]
  const recognizedFlagNames = new Set(allFlags.map((flag) => flag.name))

  // Parse command flags
  const parsedFlags: Record<string, string | number | boolean> = {}
  let missingFlag: string | null = null
  for (const flag of allFlags) {
    if (flags[flag.name] !== undefined) {
      parsedFlags[flag.name] = flags[flag.name]
    } else if (flag.defaultValue !== undefined) {
      parsedFlags[flag.name] = flag.defaultValue
    } else if (flag.required) {
      missingFlag = flag.name
      break
    }
  }
  if (missingFlag && !helpRequested) {
    const errorMsg = `Missing required flag: ${missingFlag}`
    console.error(errorMsg)
    await cliLogTracker.finish(1, errorMsg)
    process.exit(1)
  }

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

  // Handle root-level help
  if (!commandName) {
    showRootHelp(commands)
    await cliLogTracker.finish(1, 'No command provided')
    process.exit(1)
  }

  // Handle --help or -h at root level (no valid command provided)
  if ((rootFlags.help || rootFlags.h) && !commands[commandName]) {
    showRootHelp(commands)
    await cliLogTracker.finish(0, 'Showed help')
    process.exit(0)
  }

  if (!commands[commandName]) {
    const errorMsg = `Command "${commandName}" not found`
    console.error(`${errorMsg}.`)
    await cliLogTracker.finish(1, errorMsg)
    process.exit(1)
  }

  // Handle --help flag for individual commands
  if (helpRequested) {
    showCommandHelp(commands[commandName])
    await cliLogTracker.finish(0, 'Showed command help')
    process.exit(0)
  }

  try {
    if (!project) {
      const errorMsg = 'No project provided or detected'
      console.error(`${errorMsg}.`)
      await cliLogTracker.finish(1, errorMsg)
      process.exit(1)
    }

    const { success, message } = await command.run(
      project,
      parsedArgs,
      parsedFlags,
      extraArgs,
    )
    if (!success) {
      const errorMsg = (message || 'Command failed')
        .replace(/[\r\n]+/g, ' ')
        .trim()
      await cliLogTracker.finish(1, errorMsg)
      process.exit(1)
    }

    // Log successful completion
    await cliLogTracker.finish(0)
  } catch (e: unknown) {
    const errorMsg = (e instanceof Error ? e.message : 'Unknown error')
      .replace(/[\r\n]+/g, ' ')
      .trim()
    console.error(`Error executing command "${commandName}":`, e)
    await cliLogTracker.finish(1, errorMsg)
    process.exit(1)
  }
}

// Run main function when this module is executed directly
main()
