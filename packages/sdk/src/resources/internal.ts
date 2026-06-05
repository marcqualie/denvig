import { DenvigProject } from './project.ts'

import type { DenvigProject as InternalProject } from '../lib/project.ts'
import type { ResourceContext } from './context.ts'

/**
 * Wrap an already-resolved internal project into the public {@link DenvigProject}
 * resource. This lets a host that has resolved a project itself (such as the
 * CLI) hand it to the resource API without re-resolving it.
 *
 * Exposed via `@denvig/sdk/unsafe`; it is not part of the documented surface.
 */
export const wrapProject = (
  internal: InternalProject,
  ctx: ResourceContext,
): DenvigProject => new DenvigProject(internal, ctx)
