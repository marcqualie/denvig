import deno from '../plugins/deno.ts'
import githubActions from '../plugins/github-actions.ts'
import npm from '../plugins/npm.ts'
import pnpm from '../plugins/pnpm.ts'
import ruby from '../plugins/ruby.ts'
import uv from '../plugins/uv.ts'
import yarn from '../plugins/yarn.ts'

const plugins = { deno, githubActions, npm, pnpm, ruby, uv, yarn }

/**
 * Every file or directory, relative to a checkout root, that any plugin reads
 * to detect dependencies.
 */
export const pluginWatchFiles = (): string[] => [
  ...new Set(
    Object.values(plugins).flatMap((plugin) => plugin.watchFiles ?? []),
  ),
]

export default plugins
