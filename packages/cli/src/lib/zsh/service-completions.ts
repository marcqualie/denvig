import type { DenvigProject, DenvigSDK } from '@denvig/sdk'

/**
 * Build tab-completion candidates for service-name arguments.
 *
 * Current-project services appear without a prefix; global services use a
 * `global:` prefix; every other project's services are offered in both
 * `slug/service` and `id:<short>/service` form. This is shell-completion
 * presentation specific to the CLI, so it lives here rather than in the SDK.
 */
export const serviceCompletions = async (
  project: DenvigProject,
  sdk: DenvigSDK,
): Promise<string[]> => {
  const completions: string[] = []

  // Current project services, without a prefix for convenience.
  for (const name of Object.keys(project.activeWorktree.services)) {
    completions.push(name)
  }

  // Global services, with a `global:` prefix.
  const globalConfig = await sdk.config.retrieve()
  for (const name of Object.keys(globalConfig.services ?? {})) {
    completions.push(`global:${name}`)
  }

  // Every other project's services, in slug and short-id forms.
  const projects = await sdk.projects.list({ withConfig: true })
  for (const other of projects) {
    const slug = other.slug.replace(/^(github|local):/, '')
    const shortId = other.id.slice(0, 8)
    for (const name of Object.keys(other.activeWorktree.services)) {
      completions.push(`${slug}/${name}`)
      completions.push(`id:${shortId}/${name}`)
    }
  }

  return completions
}
