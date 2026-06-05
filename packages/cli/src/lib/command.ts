import type { DenvigProject, Worktree } from '@denvig/sdk'

type CommandOptions<
  ArgDefinitions extends ArgDefinition[],
  FlagDefinitions extends FlagDefinition[],
> = {
  name: string
  description?: string
  usage: string
  example: string
  args: ArgDefinitions
  flags: FlagDefinitions
  handler: CommandHandler<ArgDefinitions, FlagDefinitions>
  completions?: (
    context: { project: DenvigProject },
    inputs: string[],
  ) => string[] | Promise<string[]>
  subcommands?: Record<string, GenericCommand>
  defaultSubcommand?: string
  /**
   * When true, unrecognized positional arguments and flags are passed through
   * to the handler via `extraArgs` instead of triggering a validation error.
   * Commands that forward to external processes (e.g. `run`) should opt in.
   */
  acceptsExtraArgs?: boolean
}

type ArgDefinition = {
  name: string
  description: string
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'array'
  defaultValue?: string | number | boolean
}

type FlagDefinition = {
  name: string
  description: string
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'array'
  defaultValue?: string | number | boolean
  short?: string
}

type CommandResponse = {
  success: boolean
  message?: string
}

type ParsedArgs<
  ArgDefinitions extends ArgDefinition[],
  K extends ArgDefinitions[number]['name'] = string,
> = Record<K, string | number>

/** Global flags available to all commands */
type GlobalFlags = {
  project?: string
  json?: boolean
}

type ParsedFlags<FlagDefinitions extends FlagDefinition[]> = GlobalFlags &
  Record<FlagDefinitions[number]['name'], string | number | boolean>

type CommandHandler<
  ArgDefinitions extends ArgDefinition[],
  FlagDefinitions extends FlagDefinition[],
> = (context: {
  project: DenvigProject
  /** The active checkout for this command (cwd's worktree, or `--worktree`). */
  worktree: Worktree
  args: ParsedArgs<ArgDefinitions>
  flags: ParsedFlags<FlagDefinitions>
  extraArgs?: string[]
}) => Promise<CommandResponse> | CommandResponse

export type GenericCommand = Command<ArgDefinition[], FlagDefinition[]>

export class Command<
  ArgDefinitions extends ArgDefinition[] = [],
  FlagDefinitions extends FlagDefinition[] = [],
> {
  name: string
  description: string
  usage: string
  example: string
  args: ArgDefinitions
  flags: FlagDefinitions
  handler: CommandHandler<ArgDefinitions, FlagDefinition[]>
  completions?: (
    context: { project: DenvigProject },
    inputs: string[],
  ) => string[] | Promise<string[]>
  subcommands: Record<string, GenericCommand>
  defaultSubcommand?: string
  acceptsExtraArgs: boolean

  get hasSubcommands(): boolean {
    return Object.keys(this.subcommands).length > 0
  }

  constructor(options: CommandOptions<ArgDefinitions, FlagDefinitions>) {
    this.name = options.name
    this.description = options.description || ''
    this.usage = options.usage
    this.example = options.example
    this.args = options.args
    this.flags = options.flags
    this.handler = options.handler
    this.completions = options.completions
    this.subcommands = options.subcommands ?? {}
    this.defaultSubcommand = options.defaultSubcommand
    this.acceptsExtraArgs = options.acceptsExtraArgs ?? false
  }

  async run(
    project: DenvigProject,
    args: ParsedArgs<ArgDefinitions>,
    flags: ParsedFlags<FlagDefinitions>,
    extraArgs?: string[],
  ): Promise<CommandResponse> {
    try {
      return await this.handler({
        project,
        worktree: project.activeWorktree,
        args,
        flags,
        extraArgs,
      })
    } catch (e: unknown) {
      console.error(`Error executing command "${this.name}":`, e)
      return { success: false, message: 'fail' }
    }
  }
}
