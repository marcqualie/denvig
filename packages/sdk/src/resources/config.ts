import type { ConfigWithSourcePaths } from '../lib/config.ts'
import type {
  GlobalConfigSchema,
  ProjectConfigSchema,
} from '../schemas/config.ts'

/**
 * A resolved denvig configuration with the source files it was loaded from.
 * `denvig.config.retrieve()` returns the global config; `project.config` and
 * `denvig.config.retrieve({ project })` return a project's config.
 */
export type DenvigConfig =
  | ConfigWithSourcePaths<GlobalConfigSchema>
  | ConfigWithSourcePaths<ProjectConfigSchema>
