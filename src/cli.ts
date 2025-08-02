import { parse } from 'https://deno.land/std@0.203.0/flags/mod.ts'

import { getGlobalConfig } from './lib/config.ts'
import { DenvigProject } from './lib/project.ts'

import type { GenericCommand } from './lib/command.ts'

/**
 * Root aliases are convenient helpers to avoid typing `run` all the time.
 */
const rootRunAliases = [
  'build',
  'dev',
  'install',
  'lint',
  'outdated',
  'test',
] as const

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  let commandName = Deno.args[0]
  let args = Deno.args

  // QUick access aliases
  if (rootRunAliases.includes(commandName as (typeof rootRunAliases)[number])) {
    args = ['run', ...Deno.args]
    commandName = 'run'
  }

  // TODO: Make this dynamic based on the package.json
  console.log('Denvig v0.1.0')

  const flags = parse(args)
  const commands = {
    run: (await import('./commands/run.ts')).runCommand,
  } as Record<string, GenericCommand>

  if (!commandName) {
    console.log('No command provided. Usage: denvig <command> [options]')
    console.log('Available commands:')
    Object.keys(commands).forEach((cmd) => {
      console.log(`  - ${cmd} - ${commands[cmd].description}`)
    })
    Deno.exit(1)
  }

  if (!commands[commandName]) {
    console.error(`Command "${commandName}" not found.`)
    Deno.exit(1)
  }

  const command = commands[commandName]
  const parsedArgs = command.args.reduce(
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
  )

  const parsedFlags = command.flags.reduce(
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
  if (!projectSlug) {
    console.error('No project provided or detected.')
    Deno.exit(1)
  }
  const project = new DenvigProject(projectSlug)

  try {
    const { success } = await command.run(project, parsedArgs, parsedFlags)
    if (!success) {
      console.error(`Command "${commandName}" failed.`)
      Deno.exit(1)
    }
  } catch (e: unknown) {
    console.error(`Error executing command "${commandName}":`, e)
    Deno.exit(1)
  }
}
