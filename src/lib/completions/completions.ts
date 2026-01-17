import { getGlobalConfig } from '../config.ts'
import { listProjects } from '../projects.ts'
import { ServiceManager } from '../services/manager.ts'

import type { DenvigProject } from '../project.ts'

export type CompletionItem = {
  value: string
  description?: string
}

/**
 * Top-level commands available in denvig
 */
const topLevelCommands: CompletionItem[] = [
  { value: 'run', description: 'Run a project action' },
  { value: 'config', description: 'Show config' },
  { value: 'plugins', description: 'List plugins' },
  { value: 'version', description: 'Show version' },
  { value: 'info', description: 'Show project info' },
  { value: 'services', description: 'Manage services' },
  { value: 'deps', description: 'Manage dependencies' },
  { value: 'projects', description: 'List projects' },
  { value: 'zsh', description: 'Zsh shell integration' },
]

/**
 * Subcommands for parent commands
 */
const subcommands: Record<string, CompletionItem[]> = {
  services: [
    { value: 'start', description: 'Start services' },
    { value: 'stop', description: 'Stop services' },
    { value: 'restart', description: 'Restart services' },
    { value: 'status', description: 'Show status' },
    { value: 'logs', description: 'View logs' },
    { value: 'teardown', description: 'Remove services' },
  ],
  deps: [
    { value: 'list', description: 'List dependencies' },
    { value: 'outdated', description: 'Show outdated' },
    { value: 'why', description: 'Show why installed' },
  ],
  config: [{ value: 'verify', description: 'Verify config' }],
  projects: [{ value: 'list', description: 'List projects' }],
  zsh: [
    { value: 'completions', description: 'Output/install completions' },
    { value: '__complete__', description: 'Dynamic completion endpoint' },
  ],
}

/**
 * Commands that take a service name as an argument
 */
const serviceCommands = ['start', 'stop', 'restart', 'logs']

/**
 * Get service names from the current project
 */
async function getServiceCompletions(
  project: DenvigProject,
): Promise<CompletionItem[]> {
  try {
    const manager = new ServiceManager(project)
    const services = await manager.listServices()
    return services.map((s) => ({ value: s.name, description: 'Service' }))
  } catch {
    return []
  }
}

/**
 * Get action names from the current project
 */
async function getActionCompletions(
  project: DenvigProject,
): Promise<CompletionItem[]> {
  try {
    const actions = await project.actions
    return Object.keys(actions).map((name) => ({
      value: name,
      description: 'Action',
    }))
  } catch {
    return []
  }
}

/**
 * Get quick actions from global and project config
 */
async function getQuickActionCompletions(
  project: DenvigProject,
): Promise<CompletionItem[]> {
  const globalConfig = getGlobalConfig()
  const quickActions = [
    ...(globalConfig.quickActions || []),
    ...(project?.config?.quickActions || []),
  ]
  return quickActions.map((name) => ({
    value: name,
    description: 'Quick action',
  }))
}

/**
 * Get project name completions
 */
function getProjectCompletions(): CompletionItem[] {
  try {
    const projects = listProjects({ withConfig: true })
    return projects.map((slug) => ({ value: slug, description: 'Project' }))
  } catch {
    return []
  }
}

export type CompletionContext = {
  words: string[]
  cursor: number
  project: DenvigProject
}

/**
 * Generate completions based on the current command line context.
 *
 * @param context - The completion context
 * @returns Array of completion items
 */
export async function getCompletions(
  context: CompletionContext,
): Promise<CompletionItem[]> {
  const { words, cursor, project } = context

  // words[0] is 'denvig', words[1] is the first arg, etc.
  // cursor is 1-indexed word position (zsh uses 1-indexed)
  // cursor=2 means completing the first argument after 'denvig'

  // Position 2: completing the main command
  if (cursor === 2) {
    const quickActions = await getQuickActionCompletions(project)
    return [...topLevelCommands, ...quickActions]
  }

  const mainCommand = words[1]

  // Position 3: completing after main command
  if (cursor === 3) {
    // Check if main command has subcommands
    if (subcommands[mainCommand]) {
      return subcommands[mainCommand]
    }

    // 'run' command takes action names
    if (mainCommand === 'run') {
      return await getActionCompletions(project)
    }

    return []
  }

  // Position 4+: completing after subcommand
  if (cursor >= 4) {
    const subcommand = words[2]

    // services <subcommand> <service-name>
    if (mainCommand === 'services' && serviceCommands.includes(subcommand)) {
      return await getServiceCompletions(project)
    }
  }

  return []
}

/**
 * Format completions for zsh output.
 * Format: value:description (one per line)
 */
export function formatCompletions(completions: CompletionItem[]): string {
  return completions
    .map((c) => (c.description ? `${c.value}:${c.description}` : c.value))
    .join('\n')
}
