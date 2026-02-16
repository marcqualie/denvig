/**
 * Command registry for CLI commands and their subcommands.
 * Used by both the CLI router and zsh completions.
 */

import type { GenericCommand } from './command.ts'

/** Commands that should be hidden from completions */
export const HIDDEN_COMMANDS = ['internals', 'zsh'] as const

/** Derive root command names from a commands map */
export function getRootCommands(
  commands: Record<string, GenericCommand>,
): string[] {
  return Object.keys(commands).filter(
    (name) =>
      !name.includes(':') &&
      !HIDDEN_COMMANDS.includes(name as (typeof HIDDEN_COMMANDS)[number]),
  )
}

/** Derive subcommands map from a commands tree */
export function getSubcommands(
  commands: Record<string, GenericCommand>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {}

  const walk = (prefix: string, command: GenericCommand) => {
    if (command.hasSubcommands) {
      result[prefix] = Object.keys(command.subcommands)
      for (const [name, subcmd] of Object.entries(command.subcommands)) {
        walk(`${prefix}:${name}`, subcmd)
      }
    }
  }

  for (const [name, command] of Object.entries(commands)) {
    if (!name.includes(':')) {
      walk(name, command)
    }
  }

  return result
}
