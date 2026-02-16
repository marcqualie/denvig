import { getDenvigVersion } from './version.ts'

import type { GenericCommand } from './command.ts'

/** Global flags that are available for all commands */
export const globalFlags = [
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
] as const

export type GlobalFlag = (typeof globalFlags)[number]

type CommandsMap = Record<string, GenericCommand>

/** Commands to hide from root help */
const hiddenCommands = new Set([
  'internals:resource-hash',
  'internals:resource-id',
  'zsh:__complete__',
])

/**
 * Generate the root help text for the CLI.
 * Returns an array of lines to output.
 */
export function formatRootHelp(commands: CommandsMap): string[] {
  const lines: string[] = []

  lines.push(`Denvig v${getDenvigVersion()}`)
  lines.push('')
  lines.push('Commands:')

  // Find the longest usage string for padding
  const visibleCommands = Object.keys(commands).filter(
    (cmd) => !hiddenCommands.has(cmd) && !cmd.startsWith('internals:'),
  )
  const usages = visibleCommands.map((cmd) => `denvig ${commands[cmd].usage}`)
  const maxUsageLength = Math.max(...usages.map((u) => u.length))
  const padLength = maxUsageLength + 2

  for (const cmd of visibleCommands) {
    const usage = `denvig ${commands[cmd].usage}`
    lines.push(`  ${usage.padEnd(padLength, ' ')} ${commands[cmd].description}`)
  }

  lines.push('')
  lines.push('Options:')
  lines.push('  -h, --help       Show help')
  lines.push('  -v, --version    Show version number')

  return lines
}

/**
 * Print root help to stdout.
 */
export function showRootHelp(commands: CommandsMap): void {
  for (const line of formatRootHelp(commands)) {
    console.log(line)
  }
}

type FlagDefinition = {
  name: string
  description: string
  required: boolean
  type: string
  defaultValue?: string | number | boolean
}

/**
 * Generate help text for a specific command.
 * Returns an array of lines to output.
 */
export function formatCommandHelp(
  command: GenericCommand,
  additionalFlags: readonly FlagDefinition[] = globalFlags,
): string[] {
  const lines: string[] = []

  lines.push(`Usage: denvig ${command.usage}`)
  lines.push('')
  lines.push(command.description)

  if (command.args.length > 0) {
    lines.push('')
    lines.push('Arguments:')
    for (const arg of command.args) {
      const required = arg.required ? '' : ' (optional)'
      lines.push(`  ${arg.name}${required}`)
      lines.push(`      ${arg.description}`)
    }
  }

  const allFlags = [...additionalFlags, ...command.flags]
  if (allFlags.length > 0) {
    lines.push('')
    lines.push('Options:')
    const flagNames = allFlags.map((f) => `--${f.name}`)
    const maxFlagLength = Math.max(...flagNames.map((f) => f.length))
    const flagPadLength = maxFlagLength + 2
    for (const flag of allFlags) {
      const flagName = `--${flag.name}`
      lines.push(`  ${flagName.padEnd(flagPadLength, ' ')} ${flag.description}`)
    }
  }

  if (command.example) {
    lines.push('')
    lines.push('Example:')
    const example = command.example.startsWith('denvig ')
      ? command.example
      : `denvig ${command.example}`
    lines.push(`  ${example}`)
  }

  return lines
}

/**
 * Print command help to stdout.
 */
export function showCommandHelp(
  command: GenericCommand,
  additionalFlags: readonly FlagDefinition[] = globalFlags,
): void {
  for (const line of formatCommandHelp(command, additionalFlags)) {
    console.log(line)
  }
}

/**
 * Generate help text for a command that has subcommands.
 * Returns an array of lines to output.
 */
export function formatSubcommandHelp(command: GenericCommand): string[] {
  const lines: string[] = []

  lines.push(`Usage: denvig ${command.usage}`)
  lines.push('')
  lines.push(command.description)
  lines.push('')
  lines.push('Subcommands:')

  const visibleSubcommands = Object.entries(command.subcommands).filter(
    ([name]) => !name.startsWith('__'),
  )

  const maxNameLength = Math.max(
    ...visibleSubcommands.map(([name]) => name.length),
  )
  const padLength = maxNameLength + 2

  for (const [name, subcmd] of visibleSubcommands) {
    lines.push(`  ${name.padEnd(padLength, ' ')} ${subcmd.description}`)
  }

  return lines
}

/**
 * Print subcommand help to stdout.
 */
export function showSubcommandHelp(command: GenericCommand): void {
  for (const line of formatSubcommandHelp(command)) {
    console.log(line)
  }
}
