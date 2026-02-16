#!/usr/bin/env node

import parseArgs from 'minimist'

import {
  globalFlags,
  showCommandHelp,
  showRootHelp,
  showSubcommandHelp,
} from './lib/cli-help.ts'
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
  if (commandName === 'outdated') {
    commandName = 'deps'
    args = ['deps', 'outdated', ...process.argv.slice(3)]
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
  const { configCommand } = await import('./commands/config/index.ts')
  const { pluginsCommand } = await import('./commands/plugins.ts')
  const { versionCommand } = await import('./commands/version.ts')
  const { infoCommand } = await import('./commands/info.ts')
  const { servicesCommand } = await import('./commands/services/index.ts')
  const { internalsResourceHashCommand, internalsResourceIdCommand } =
    await import('./commands/internals.ts')
  const { depsCommand } = await import('./commands/deps/index.ts')
  const { projectsListCommand } = await import('./commands/projects/list.ts')
  const { zshCompletionsCommand } = await import(
    './commands/zsh/completions.ts'
  )
  const { zshCompleteCommand } = await import('./commands/zsh/__complete__.ts')
  const { gatewayStatusCommand } = await import('./commands/gateway/status.ts')
  const { gatewayGenerateCertsCommand } = await import(
    './commands/gateway/generate-certs.ts'
  )
  const { zshCommand } = await import('./commands/zsh/index.ts')
  const { certsCommand } = await import('./commands/certs/index.ts')

  const commands = {
    run: runCommand,
    config: configCommand,
    plugins: pluginsCommand,
    version: versionCommand,
    info: infoCommand,
    services: servicesCommand,
    deps: depsCommand,
    'internals:resource-hash': internalsResourceHashCommand,
    'internals:resource-id': internalsResourceIdCommand,
    projects: projectsListCommand,
    'projects:list': projectsListCommand,
    'zsh:completions': zshCompletionsCommand,
    'zsh:__complete__': zshCompleteCommand,
    gateway: gatewayStatusCommand,
    'gateway:status': gatewayStatusCommand,
    'gateway:generate-certs': gatewayGenerateCertsCommand,
    zsh: zshCommand,
    certs: certsCommand,
  } as Record<string, GenericCommand>

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

  // Resolve subcommands: walk the command tree consuming from args
  // args[0] is command name, args[1..] are potential subcommands/arguments
  const helpRequested = rootFlags.help || rootFlags.h
  let command = commands[commandName]
  let subArgIndex = 1
  while (command.hasSubcommands) {
    const nextArg = args[subArgIndex]
    if (nextArg && command.subcommands[nextArg]) {
      command = command.subcommands[nextArg]
      subArgIndex++
    } else if (command.defaultSubcommand && !helpRequested) {
      // Only apply default when not requesting help, so --help shows subcommand list
      command = command.subcommands[command.defaultSubcommand]
    } else {
      break
    }
  }

  // Rebuild args: keep the root command name, then any unconsumed args
  args = [args[0], ...args.slice(subArgIndex)]

  const flags = parseArgs(args)

  // If help is requested, show appropriate help
  if (helpRequested) {
    if (command.hasSubcommands) {
      showSubcommandHelp(command)
    } else {
      showCommandHelp(command)
    }
    await cliLogTracker.finish(0, 'Showed command help')
    process.exit(0)
  }

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
  if (missingArg) {
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
  if (missingFlag) {
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
