import { teardownGlobal } from '@denvig/sdk/internal'

import { Command } from '../../lib/command.ts'
import { reconcileAfterCommand } from '../../lib/services/reconcileLogger.ts'

export const servicesTeardownCommand = new Command({
  name: 'services:teardown',
  description: 'Stop all services and remove them from launchctl',
  usage: 'services teardown [--global] [--remove-logs] [--worktree <branch>]',
  example: 'services teardown',
  args: [],
  flags: [
    {
      name: 'global',
      description: 'Teardown all denvig services across all projects',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'remove-logs',
      description: 'Also remove log files',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'worktree',
      description:
        'Teardown services for a sibling git worktree by branch name (use "main" for the primary checkout)',
      required: false,
      type: 'string',
    },
  ],
  handler: async ({ project, worktree, flags }) => {
    const removeLogs = flags['remove-logs'] as boolean
    const global = flags.global as boolean
    const worktreeFlag =
      typeof flags.worktree === 'string' ? flags.worktree : null

    if (global && worktreeFlag !== null) {
      const message = 'Cannot use --global and --worktree together.'
      if (flags.json) {
        console.log(JSON.stringify({ success: false, message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    let activeWorktree = worktree
    if (worktreeFlag !== null) {
      try {
        activeWorktree = project.selectWorktree(worktreeFlag)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (flags.json) {
          console.log(JSON.stringify({ success: false, message }))
        } else {
          console.error(message)
        }
        return { success: false, message }
      }
    }

    if (global) {
      // Global teardown - all denvig services across all projects
      if (!flags.json) {
        console.log('Tearing down all denvig services globally...')
      }

      const result = await teardownGlobal({ removeLogs })

      if (flags.json) {
        console.log(JSON.stringify(result))
      } else {
        if (result.services.length === 0) {
          console.log('No services found to teardown.')
        } else {
          for (const service of result.services) {
            if (service.success) {
              console.log(`✓ ${service.name} removed`)
            } else {
              console.log(`✗ ${service.name}: ${service.message}`)
            }
          }
          console.log('')
          console.log(
            `Teardown complete. ${result.services.filter((r) => r.success).length}/${result.services.length} services removed.`,
          )
          if (removeLogs) {
            console.log('Log files have been removed.')
          }
        }
      }

      await reconcileAfterCommand({ json: !!flags.json })
      return { success: true, message: 'Global teardown complete' }
    }

    // Project-specific teardown
    if (!flags.json) {
      console.log(`Tearing down all services for ${activeWorktree.slug}...`)
    }

    const result = await project.teardown({ removeLogs })

    if (flags.json) {
      console.log(JSON.stringify(result))
    } else {
      if (result.services.length === 0) {
        console.log('No services found to teardown.')
      } else {
        for (const service of result.services) {
          if (service.success) {
            console.log(`✓ ${service.name} removed`)
          } else {
            console.log(`✗ ${service.name}: ${service.message}`)
          }
        }
        console.log('')
        console.log(
          `Teardown complete. ${result.services.filter((r) => r.success).length}/${result.services.length} services removed.`,
        )
        if (removeLogs) {
          console.log('Log files have been removed.')
        }
      }
    }

    await reconcileAfterCommand({ json: !!flags.json })
    return { success: true, message: 'Teardown complete' }
  },
})
