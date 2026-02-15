import { ROOT_COMMANDS, SUBCOMMANDS } from '../commands.ts'
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

  if (words.length === 1) {
    return [...ROOT_COMMANDS]
  }

  const commandName = words[1]
  const subcommands = SUBCOMMANDS[commandName]

  if (words.length === 2) {
    // Check if it's a complete command with subcommands
    if (subcommands) {
      return [...subcommands]
    }
    // Check if it's a complete direct command (no subcommands)
    if (
      ROOT_COMMANDS.includes(commandName as (typeof ROOT_COMMANDS)[number]) &&
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
    return ROOT_COMMANDS.filter((cmd) => cmd.startsWith(commandName))
  }

  if (words.length === 3 && subcommands) {
    const partial = words[2]
    // Check if it's a complete subcommand or partial
    if (subcommands.includes(partial)) {
      // Check if this subcommand itself has sub-subcommands
      const nestedKey = `${commandName}:${partial}`
      const nestedSubcommands = SUBCOMMANDS[nestedKey]
      if (nestedSubcommands) {
        return [...nestedSubcommands]
      }
      // Complete subcommand - get command completions
      const fullCommandName = `${commandName}:${partial}`
      const command = context?.commands[fullCommandName]
      if (command?.completions && context?.project) {
        return await command.completions({ project: context.project }, [])
      }
      return []
    }
    // Partial subcommand - filter subcommands
    return subcommands.filter((subcmd) => subcmd.startsWith(partial))
  }

  // Handle nested sub-subcommands (e.g., "denvig certs ca install")
  if (words.length === 4 && subcommands) {
    const subcommand = words[2]
    const nestedKey = `${commandName}:${subcommand}`
    const nestedSubcommands = SUBCOMMANDS[nestedKey]
    if (nestedSubcommands) {
      const partial = words[3]
      if (nestedSubcommands.includes(partial)) {
        // Complete sub-subcommand - get command completions
        const fullCommandName = `${commandName}:${subcommand}:${partial}`
        const command = context?.commands[fullCommandName]
        if (command?.completions && context?.project) {
          return await command.completions({ project: context.project }, [])
        }
        return []
      }
      return nestedSubcommands.filter((subcmd) => subcmd.startsWith(partial))
    }
  }

  // For deeper completions, find the command and call its completions
  if (context?.commands && context?.project) {
    let command: GenericCommand | undefined
    let inputs: string[]

    // Check for nested sub-subcommands first (e.g., "denvig certs ca install <args>")
    const nestedKey = subcommands ? `${commandName}:${words[2]}` : ''
    const nestedSubcommands = nestedKey ? SUBCOMMANDS[nestedKey] : undefined

    if (nestedSubcommands && words.length >= 4) {
      const fullCommandName = `${commandName}:${words[2]}:${words[3]}`
      command = context.commands[fullCommandName]
      inputs = words.slice(4)
    } else if (subcommands) {
      // Command with subcommands: "denvig services start <args>"
      const subcommand = words[2]
      const fullCommandName = `${commandName}:${subcommand}`
      command = context.commands[fullCommandName]
      inputs = words.slice(3) // Args after subcommand
    } else {
      // Direct command: "denvig run <args>"
      command = context.commands[commandName]
      inputs = words.slice(2) // Args after command
    }

    if (command?.completions) {
      const allCompletions = await command.completions(
        { project: context.project },
        inputs,
      )
      // Filter by partial input if present
      const partial = inputs[inputs.length - 1] || ''
      if (partial) {
        return allCompletions.filter((c) => c.startsWith(partial))
      }
      return allCompletions
    }
  }

  return []
}
