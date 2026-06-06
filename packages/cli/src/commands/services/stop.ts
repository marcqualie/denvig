import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { reconcileAfterCommand } from '../../lib/services/reconcileLogger.ts'
import { serviceCompletions } from '../../lib/zsh/service-completions.ts'

export const servicesStopCommand = new Command({
  name: 'services:stop',
  description: 'Stop a service',
  usage: 'services stop <name> [--worktree <branch>]',
  example: 'services stop api',
  args: [
    {
      name: 'name',
      description:
        'Service name or project/service path (e.g., api or marcqualie/denvig/hello)',
      required: true,
      type: 'string',
    },
  ],
  flags: [
    {
      name: 'worktree',
      description:
        'Target the service in a sibling git worktree by branch name (use "main" for the primary checkout)',
      required: false,
      type: 'string',
    },
  ],
  completions: ({ project, sdk }) => {
    return serviceCompletions(project, sdk)
  },
  handler: async ({ project, worktree, args, flags }) => {
    const serviceArg = z.string().parse(args.name)

    let activeWorktree = worktree
    if (typeof flags.worktree === 'string') {
      try {
        activeWorktree = project.selectWorktree(flags.worktree)
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

    const { manager, serviceName, target } =
      await project.services.context(serviceArg)

    const projectPrefix =
      target.slug !== activeWorktree.slug ? `${target.slug}/` : ''

    if (!flags.json) {
      console.log(`Stopping ${projectPrefix}${serviceName}...`)
    }

    const result = await manager.stopService(serviceName)

    if (!result.success) {
      if (flags.json) {
        console.log(
          JSON.stringify({
            success: false,
            service: serviceName,
            project: target.slug,
            message: result.message,
          }),
        )
      } else {
        console.error(
          `✗ Failed to stop ${projectPrefix}${serviceName}: ${result.message}`,
        )
      }
      return { success: false, message: result.message }
    }

    // Get service response after stopping
    const response = await manager.getServiceResponse(serviceName)

    await reconcileAfterCommand({ json: !!flags.json })

    if (flags.json) {
      console.log(JSON.stringify(response))
    } else {
      console.log(`✓ ${projectPrefix}${serviceName} stopped successfully`)
    }
    return { success: true, message: 'Service stopped successfully.' }
  },
})
