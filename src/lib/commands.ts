/**
 * Command registry for CLI commands and their subcommands.
 * Used by both the CLI router and zsh completions.
 */

/** Root-level commands that appear in completions */
export const ROOT_COMMANDS = [
  'config',
  'deps',
  'info',
  'outdated',
  'plugins',
  'projects',
  'run',
  'services',
  'version',
  'zsh',
] as const

/** Commands that should be hidden from completions */
export const HIDDEN_COMMANDS = ['internals', 'zsh'] as const

/** Subcommands for each parent command */
export const SUBCOMMANDS: Record<string, readonly string[]> = {
  services: ['start', 'stop', 'restart', 'status', 'logs', 'teardown'],
  deps: ['list', 'outdated', 'why'],
  config: ['verify'],
  projects: ['list'],
  zsh: ['completions', '__complete__'],
} as const
