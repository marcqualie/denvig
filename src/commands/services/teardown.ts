import { Command } from '../../lib/command.ts'
import { teardownGlobal, teardownProject } from '../../lib/teardown.ts'

export const servicesTeardownCommand = new Command({
  name: 'services:teardown',
  description: 'Stop all services and remove them from launchctl',
  usage: 'services teardown [--global] [--remove-logs]',
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
  ],
  handler: async ({ project, flags }) => {
    const removeLogs = flags['remove-logs'] as boolean
    const global = flags.global as boolean

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

      return { success: true, message: 'Global teardown complete' }
    }

    // Project-specific teardown
    if (!flags.json) {
      console.log(`Tearing down all services for ${project.slug}...`)
    }

    const result = await teardownProject(project, { removeLogs })

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

    return { success: true, message: 'Teardown complete' }
  },
})
