import {
  getProjectCompletions,
  getProjectFlagPartial,
} from './project-completions.ts'

import type { GenericCommand } from '../command.ts'
import type { DenvigProject } from '../project.ts'

type CompletionContext = {
  project: DenvigProject
  commands: Record<string, GenericCommand>
}

/**
 * Resolve the command and remaining words by walking the subcommand tree.
 * Returns the resolved command (or undefined) and any unconsumed words.
 */
const resolveCommand = (
  words: string[],
  commands: Record<string, GenericCommand>,
): { command: GenericCommand | undefined; remaining: string[] } => {
  if (words.length === 0) return { command: undefined, remaining: [] }

  const commandName = words[0]
  let command = commands[commandName]
  if (!command) return { command: undefined, remaining: words }

  let i = 1
  while (i < words.length && command.hasSubcommands) {
    const nextWord = words[i]
    if (command.subcommands[nextWord]) {
      command = command.subcommands[nextWord]
      i++
    } else {
      break
    }
  }

  return { command, remaining: words.slice(i) }
}

export const zshCompletionsFor = async (
  words: string[],
  context?: CompletionContext,
): Promise<string[]> => {
  // words[0] is "denvig", words[1] is command, words[2] is subcommand or arg, etc.

  // Check if we're completing a --project flag value
  const projectPartial = getProjectFlagPartial(words)
  if (projectPartial !== null) {
    return getProjectCompletions(projectPartial)
  }

  const commands = context?.commands ?? {}
  const rootCommands = Object.keys(commands).filter(
    (name) => !name.includes(':'),
  )

  if (words.length === 1) {
    return rootCommands
  }

  const commandName = words[1]
  const topCommand = commands[commandName]

  if (words.length === 2) {
    // Complete command with subcommands
    if (topCommand?.hasSubcommands) {
      return Object.keys(topCommand.subcommands)
    }
    // Complete direct command (no subcommands) - get command completions
    if (
      rootCommands.includes(commandName) &&
      context?.commands &&
      context?.project
    ) {
      const command = context.commands[commandName]
      if (command?.completions) {
        return await command.completions({ project: context.project }, [])
      }
      return []
    }
    // Partial command name - filter root commands
    return rootCommands.filter((cmd) => cmd.startsWith(commandName))
  }

  // For deeper words, resolve the command tree and handle completion
  if (!topCommand) return []

  const commandWords = words.slice(1) // everything after "denvig"
  const { command: resolved, remaining } = resolveCommand(
    commandWords,
    commands,
  )

  if (!resolved) return []

  // If the resolved command has subcommands and we have at most one remaining word
  // (which may be partial), offer subcommand completions
  if (resolved.hasSubcommands && remaining.length <= 1) {
    const partial = remaining[0] || ''
    const subcmdNames = Object.keys(resolved.subcommands)
    if (partial && !resolved.subcommands[partial]) {
      return subcmdNames.filter((name) => name.startsWith(partial))
    }
    // If the partial exactly matches a subcommand, descend into it
    if (partial && resolved.subcommands[partial]) {
      const child = resolved.subcommands[partial]
      if (child.hasSubcommands) {
        return Object.keys(child.subcommands)
      }
      if (child.completions && context?.project) {
        return await child.completions({ project: context.project }, [])
      }
      return []
    }
    return subcmdNames
  }

  // Leaf command with remaining args - call its completions handler
  if (resolved.completions && context?.project) {
    const allCompletions = await resolved.completions(
      { project: context.project },
      remaining,
    )
    const partial = remaining[remaining.length - 1] || ''
    if (partial) {
      return allCompletions.filter((c) => c.startsWith(partial))
    }
    return allCompletions
  }

  return []
}
