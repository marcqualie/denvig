import { runActionCommands } from '../lib/actions/run.ts'
import { track } from './context.ts'

import type { Worktree } from '../lib/project/worktree.ts'
import type { ResourceContext } from './context.ts'

/**
 * A runnable action resolved for a worktree. `run()` streams the underlying
 * command(s) to the parent process, TTY-aware, exactly as the CLI does.
 */
export class DenvigAction {
  private readonly _name: string
  private readonly _commands: string[]
  private readonly worktree: Worktree
  private readonly ctx: ResourceContext

  constructor(
    name: string,
    commands: string[],
    worktree: Worktree,
    ctx: ResourceContext,
  ) {
    this._name = name
    this._commands = commands
    this.worktree = worktree
    this.ctx = ctx
  }

  get name(): string {
    return this._name
  }

  /** The resolved shell command(s) this action runs, in order. */
  get commands(): string[] {
    return this._commands
  }

  /** Run the action's commands, streaming output to the parent process. */
  async run(options?: { args?: string[] }): Promise<{ success: boolean }> {
    return track(this.ctx, 'actions.run', this.worktree.slug, () =>
      runActionCommands(this._commands, {
        args: options?.args,
        projectSlug: this.worktree.slug,
        cwd: this.worktree.path,
      }),
    )
  }
}
