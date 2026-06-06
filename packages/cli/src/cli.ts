#!/usr/bin/env node

import { type ParseArgsConfig, parseArgs } from 'node:util'
import { DenvigSDK } from '@denvig/sdk'
import { createCliLogTracker, getGlobalConfig } from '@denvig/sdk/unsafe'

import {
  formatCommandHelp,
  formatRootHelp,
  formatSubcommandHelp,
  globalFlags,
  showCommandHelp,
  showRootHelp,
  showSubcommandHelp,
} from './lib/cli-help.ts'

import type { GenericCommand } from './lib/command.ts'

type ParseArgsOptions = NonNullable<ParseArgsConfig['options']>

// Main CLI execution
async function main() {
  let commandName = process.argv[2]
  let args = process.argv.slice(2)

  // Initial lenient parse for root-level flags. Unknown flags are tolerated
  // because the command (and its flag schema) hasn't been resolved yet.
  const rootResult = parseArgs({
    args,
    options: {
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
      project: { type: 'string' },
    },
    strict: false,
    allowPositionals: true,
  })
  const rootFlags = rootResult.values

  const denvig = new DenvigSDK({ client: 'cli', cwd: process.cwd() })

  // Handle root-level --version/-v
  if (rootFlags.version) {
    console.log(`v${denvig.version()}`)
    process.exit(0)
  }

  // Detect project from current directory or --project flag
  const globalConfig = await getGlobalConfig()
  const projectFlag =
    typeof rootFlags.project === 'string' ? rootFlags.project : undefined

  const { project, slug } = await denvig.projects.detect(projectFlag)

  // Initialize CLI logging (after project detection for slug)
  const cliLogTracker = createCliLogTracker({
    version: denvig.version(),
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
    ...(project?.activeWorktree.config?.quickActions ?? []),
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
  const { projectsCommand } = await import('./commands/projects/index.ts')
  const { shellCommand } = await import('./commands/shell/index.ts')
  const { gatewayCommand } = await import('./commands/gateway/index.ts')
  const { certsCommand } = await import('./commands/certs/index.ts')
  const { systemCommand } = await import('./commands/system/index.ts')

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
    projects: projectsCommand,
    shell: shellCommand,
    gateway: gatewayCommand,
    certs: certsCommand,
    system: systemCommand,
  } as Record<string, GenericCommand>

  // Handle root-level help
  if (!commandName) {
    showRootHelp(commands, denvig.version())
    await cliLogTracker.finish(1, 'No command provided')
    process.exit(1)
  }

  // Handle --help or -h at root level (no valid command provided)
  if (rootFlags.help && !commands[commandName]) {
    showRootHelp(commands, denvig.version())
    await cliLogTracker.finish(0, 'Showed help')
    process.exit(0)
  }

  const printLinesToStderr = (lines: string[]) => {
    console.error('')
    for (const line of lines) console.error(line)
  }

  if (!commands[commandName]) {
    const errorMsg = `Command "${commandName}" not found`
    console.error(`${errorMsg}.`)
    printLinesToStderr(formatRootHelp(commands, denvig.version()))
    await cliLogTracker.finish(1, errorMsg)
    process.exit(1)
  }

  // Resolve subcommands: walk the command tree consuming from args
  // args[0] is command name, args[1..] are potential subcommands/arguments
  const helpRequested = !!rootFlags.help
  let command = commands[commandName]
  let subArgIndex = 1
  while (command.hasSubcommands) {
    const nextArg = args[subArgIndex]
    if (nextArg && command.subcommands[nextArg]) {
      command = command.subcommands[nextArg]
      subArgIndex++
    } else if (
      nextArg &&
      !nextArg.startsWith('-') &&
      !command.acceptsExtraArgs
    ) {
      const available = Object.keys(command.subcommands)
        .filter((n) => !n.startsWith('__'))
        .join(', ')
      const errorMsg = `Unknown subcommand "${nextArg}" for "${command.name}". Available subcommands: ${available}`
      console.error(errorMsg)
      printLinesToStderr(formatSubcommandHelp(command))
      await cliLogTracker.finish(1, errorMsg)
      process.exit(1)
    } else if (command.defaultSubcommand && !helpRequested) {
      // Only apply default when not requesting help, so --help shows subcommand list
      command = command.subcommands[command.defaultSubcommand]
    } else {
      break
    }
  }

  // Rebuild args: keep the root command name, then any unconsumed args
  args = [args[0], ...args.slice(subArgIndex)]

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

  // Build options config from the resolved command's flags so parseArgs can
  // distinguish known options (with their types and short aliases) from
  // unknown ones (which still parse leniently via strict: false).
  const allFlags = [...globalFlags, ...(command?.flags || [])]
  const optionsConfig: ParseArgsOptions = {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  }
  for (const flag of allFlags) {
    const short = 'short' in flag ? flag.short : undefined
    optionsConfig[flag.name] = {
      type: flag.type === 'boolean' ? 'boolean' : 'string',
      ...(short ? { short } : {}),
    }
  }

  const result = parseArgs({
    args,
    options: optionsConfig,
    strict: false,
    allowPositionals: true,
    tokens: true,
  })

  // Parse command arguments from positionals (skipping the command name itself)
  const parsedArgs: Record<string, string | number> = {}
  let missingArg: string | null = null
  for (const [index, arg] of (command?.args || []).entries()) {
    const value = result.positionals[index + 1]
    if (value !== undefined) {
      parsedArgs[arg.name] = arg.type === 'number' ? Number(value) : value
    } else if (arg.required) {
      missingArg = arg.name
      break
    }
  }
  if (missingArg) {
    const errorMsg = `Missing required argument: ${missingArg}`
    console.error(errorMsg)
    printLinesToStderr(formatCommandHelp(command))
    await cliLogTracker.finish(1, errorMsg)
    process.exit(1)
  }

  const recognizedFlagNames = new Set(allFlags.map((flag) => flag.name))

  // Parse command flags, applying defaults and number coercion
  const parsedFlags: Record<string, string | number | boolean> = {}
  let missingFlag: string | null = null
  for (const flag of allFlags) {
    const value = result.values[flag.name]
    if (value !== undefined) {
      parsedFlags[flag.name] =
        flag.type === 'number' && typeof value === 'string'
          ? Number(value)
          : value
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
    printLinesToStderr(formatCommandHelp(command))
    await cliLogTracker.finish(1, errorMsg)
    process.exit(1)
  }

  // Walk tokens in original order to collect anything not consumed by the
  // command's defined args/flags. This preserves the order users typed so
  // forwarded subprocesses receive arguments as expected. Commands that don't
  // opt in to extraArgs error on any unrecognized positional or flag, which
  // catches typos like `services listtt` or `services --al`.
  const definedArgsCount = command?.args.length || 0
  const extraArgs: string[] = []
  let positionalIndex = 0
  for (const token of result.tokens ?? []) {
    if (token.kind === 'positional') {
      if (positionalIndex > definedArgsCount) {
        if (!command.acceptsExtraArgs) {
          const errorMsg = `Unexpected argument: "${token.value}"`
          console.error(errorMsg)
          printLinesToStderr(formatCommandHelp(command))
          await cliLogTracker.finish(1, errorMsg)
          process.exit(1)
        }
        extraArgs.push(token.value)
      }
      positionalIndex++
    } else if (token.kind === 'option') {
      if (recognizedFlagNames.has(token.name)) continue
      if (token.name === 'help' || token.name === 'version') continue
      const rawName = token.rawName ?? `--${token.name}`
      if (!command.acceptsExtraArgs) {
        const errorMsg = `Unknown flag: ${rawName}`
        console.error(errorMsg)
        printLinesToStderr(formatCommandHelp(command))
        await cliLogTracker.finish(1, errorMsg)
        process.exit(1)
      }
      if (token.value !== undefined) {
        if (token.inlineValue) {
          extraArgs.push(`${rawName}=${token.value}`)
        } else {
          extraArgs.push(rawName, token.value)
        }
      } else {
        extraArgs.push(rawName)
      }
    }
  }

  try {
    if (!project) {
      const errorMsg = 'No project provided or detected'
      console.error(`${errorMsg}.`)
      await cliLogTracker.finish(1, errorMsg)
      process.exit(1)
    }

    const { success, message } = await command.run(
      denvig,
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
