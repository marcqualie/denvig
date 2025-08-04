import type { DenvigProject } from './project.ts'

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
}

type CommandResponse = {
  success: boolean
  message?: string
}

type ParsedArgs<
  ArgDefinitions extends ArgDefinition[],
  K extends ArgDefinitions[number]['name'] = string,
> = Record<K, string | number>

type ParsedFlags<FlagDefinitions extends FlagDefinition[]> = Record<
  FlagDefinitions[number]['name'],
  string | number | boolean
>

type CommandHandler<
  ArgDefinitions extends ArgDefinition[],
  FlagDefinitions extends FlagDefinition[],
> = (context: {
  project: DenvigProject
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

  constructor(options: CommandOptions<ArgDefinitions, FlagDefinitions>) {
    this.name = options.name
    this.description = options.description || ''
    this.usage = options.usage
    this.example = options.example
    this.args = options.args
    this.flags = options.flags
    this.handler = options.handler
  }

  async run(
    project: DenvigProject,
    args: ParsedArgs<ArgDefinitions>,
    flags: ParsedFlags<FlagDefinitions>,
    extraArgs?: string[],
  ): Promise<CommandResponse> {
    try {
      return await this.handler({ project, args, flags, extraArgs })
    } catch (e: unknown) {
      console.error(`Error executing command "${this.name}":`, e)
      return { success: false, message: 'fail' }
    }
  }
}
