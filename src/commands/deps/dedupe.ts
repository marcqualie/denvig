import { Command } from '../../lib/command.ts'
import { COLORS } from '../../lib/formatters/table.ts'

export const depsDedupeCommand = new Command({
  name: 'deps:dedupe',
  description:
    'Deduplicate lockfile dependencies by combining compatible versions',
  usage: 'deps dedupe [--apply]',
  example: 'denvig deps dedupe',
  args: [],
  flags: [
    {
      name: 'apply',
      description:
        'Apply deduplication changes to the lockfile and run install',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ project, flags }) => {
    const apply = flags.apply as boolean

    const results = await project.deduplicateDependencies({ dryRun: !apply })

    if (results.length === 0) {
      console.error(
        'Dependency deduplication is not supported for this project.',
      )
      return {
        success: false,
        message: 'No supported package manager found.',
      }
    }

    let hasChanges = false

    for (const result of results) {
      if (Object.keys(result.removals).length === 0) {
        continue
      }
      hasChanges = true

      const removedCount = Object.values(result.removals).flat().length

      if (flags.json) {
        console.log(
          JSON.stringify({
            ecosystem: result.ecosystem,
            optimised: false,
            totalDependencies: result.totalDependencies,
            optimisedDependencies: result.optimisedDependencies,
            changes: result.details,
            applied: result.applied,
          }),
        )
      } else {
        console.log(
          `Can be optimised from ${result.totalDependencies} to ${result.optimisedDependencies} resolved versions (${result.ecosystem})`,
        )
        console.log('')

        for (const detail of result.details) {
          const colored = detail.versions.map((v: string) =>
            detail.optimisedVersions.includes(v)
              ? `${COLORS.green}${v}${COLORS.reset}`
              : `${COLORS.red}${v}${COLORS.reset}`,
          )
          console.log(`${detail.name}: ${colored.join(', ')}`)
        }

        console.log('')

        if (apply) {
          console.log(`Removed ${removedCount} duplicate version(s).`)
        } else {
          console.log(
            `${removedCount} duplicate version(s) can be removed. Run with --apply to apply.`,
          )
        }
      }
    }

    if (!hasChanges) {
      if (flags.json) {
        console.log(JSON.stringify({ optimised: true, changes: [] }))
      } else {
        console.log(
          'No deduplication possible. Lockfiles are already optimised.',
        )
      }
    }

    return { success: true, message: 'Deduplication complete.' }
  },
})
