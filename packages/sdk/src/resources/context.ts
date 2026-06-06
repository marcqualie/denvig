import { createCliLogTracker } from '../lib/cli-logs.ts'
import { getDenvigVersion } from '../lib/version.ts'

/**
 * Shared context threaded through every resource so SDK calls are attributed to
 * the calling client in the usage log (`via: sdk:<client>`).
 */
export type ResourceContext = {
  /** Identifier for the integration using the SDK (e.g. `cli`, `raycast`). */
  client: string
  /** Working directory used to resolve projects and as the log entry path. */
  cwd: string
}

/**
 * Run an operation wrapped in a usage-log entry (`via: sdk:<client>`). The
 * original error is preserved (and rethrown) so callers can still discriminate
 * `DenvigValidationError` / `DenvigOperationError`.
 */
export const track = async <T>(
  ctx: ResourceContext,
  command: string,
  slug: string | null,
  fn: () => Promise<T>,
): Promise<T> => {
  const tracker = createCliLogTracker({
    version: getDenvigVersion(),
    command: `sdk:${command}`,
    path: ctx.cwd,
    slug: slug ?? undefined,
    via: `sdk:${ctx.client}`,
  })
  try {
    const result = await fn()
    await tracker.finish(0)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await tracker.finish(1, message.replace(/[\r\n]+/g, ' ').trim())
    throw error
  }
}
