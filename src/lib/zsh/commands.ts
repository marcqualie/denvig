import type { GenericCommand } from '../command.ts'

/**
 * Dynamically imports and returns all top-level commands for use in completions.
 * Subcommands are accessed via each command's `subcommands` property.
 */
export const getCommands = async (): Promise<
  Record<string, GenericCommand>
> => {
  const { runCommand } = await import('../../commands/run.ts')
  const { configCommand } = await import('../../commands/config/index.ts')
  const { pluginsCommand } = await import('../../commands/plugins.ts')
  const { versionCommand } = await import('../../commands/version.ts')
  const { infoCommand } = await import('../../commands/info.ts')
  const { servicesCommand } = await import('../../commands/services/index.ts')
  const { depsCommand } = await import('../../commands/deps/index.ts')
  const { projectsListCommand } = await import(
    '../../commands/projects/list.ts'
  )
  const { zshCommand } = await import('../../commands/zsh/index.ts')
  const { certsCommand } = await import('../../commands/certs/index.ts')

  return {
    run: runCommand,
    config: configCommand,
    plugins: pluginsCommand,
    version: versionCommand,
    info: infoCommand,
    services: servicesCommand,
    deps: depsCommand,
    projects: projectsListCommand,
    zsh: zshCommand,
    certs: certsCommand,
  }
}

/**
 * Flatten a commands tree into a flat map with colon-separated keys.
 * e.g., { services: { subcommands: { start: ... } } } -> { "services:start": ... }
 */
export const flattenCommands = (
  commands: Record<string, GenericCommand>,
): Record<string, GenericCommand> => {
  const result: Record<string, GenericCommand> = {}

  const walk = (prefix: string, command: GenericCommand) => {
    result[prefix] = command
    for (const [name, subcmd] of Object.entries(command.subcommands)) {
      walk(`${prefix}:${name}`, subcmd)
    }
  }

  for (const [name, command] of Object.entries(commands)) {
    walk(name, command)
  }

  return result
}
