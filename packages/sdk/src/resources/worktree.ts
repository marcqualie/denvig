import type { Worktree as InternalWorktree } from '../lib/project/worktree.ts'

/**
 * A public, read-only view of a single git checkout belonging to a project.
 * Path-sensitive operations (actions, services, dependencies) are reached
 * through the owning {@link DenvigProject}'s namespaces, not from here.
 */
export class DenvigWorktree {
  private readonly internal: InternalWorktree

  constructor(internal: InternalWorktree) {
    this.internal = internal
  }

  get name(): string {
    return this.internal.name
  }

  get branch(): string {
    return this.internal.branch
  }

  get path(): string {
    return this.internal.path
  }

  get slug(): string {
    return this.internal.slug
  }

  get id(): string {
    return this.internal.id
  }

  get isPrimary(): boolean {
    return this.internal.isPrimary
  }
}
