import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { ensureServiceCerts } from '../../lib/services/certs.ts'
import { reconcileAfterCommand } from '../../lib/services/reconcileLogger.ts'
import { resolveServicePortForCli } from '../../lib/services/resolvePort.ts'
import { serviceCompletions } from '../../lib/zsh/service-completions.ts'

export const servicesRestartCommand = new Command({
  name: 'services:restart',
  description: 'Restart a service',
  usage:
    'services restart <name> [--worktree <branch>] [--random-port] [--claim-domain]',
  example: 'services restart api',
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
    {
      name: 'random-port',
      description:
        'Skip the config port and start on a randomly allocated dev port',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'claim-domain',
      description:
        'Override the existing gateway route so the configured domain points at this start',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'no-claim-domain',
      description:
        'Leave the existing gateway route untouched even when the config port is busy',
      required: false,
      type: 'boolean',
      defaultValue: false,
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
    const targetProject = target

    const projectPrefix =
      targetProject.slug !== activeWorktree.slug ? `${targetProject.slug}/` : ''

    const serviceConfig = targetProject.config.services?.[serviceName]
    if (serviceConfig) {
      await ensureServiceCerts(serviceName, serviceConfig, {
        json: !!flags.json,
      })
    }

    const portResolution = await resolveServicePortForCli(
      manager,
      serviceName,
      flags,
      targetProject,
    )
    if (portResolution === null) {
      return { success: false, message: 'Port resolution aborted.' }
    }

    if (!flags.json) {
      console.log(`Restarting ${projectPrefix}${serviceName}...`)
    }

    const result = await manager.restartService(serviceName, {
      port: portResolution.port,
      portResolved: true,
      claimDomain: portResolution.claimDomain ?? undefined,
    })

    if (!result.success) {
      if (flags.json) {
        console.log(
          JSON.stringify({
            success: false,
            service: serviceName,
            project: targetProject.slug,
            message: result.message,
          }),
        )
      } else {
        console.error(
          `✗ Failed to restart ${projectPrefix}${serviceName}: ${result.message}`,
        )
      }
      return { success: false, message: result.message }
    }

    // Wait for service to start
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get service response
    const response = await manager.getServiceResponse(serviceName, {
      includeLogs: true,
    })

    if (response?.status === 'running') {
      // Reconfigure gateway nginx configs
      await manager.reconfigureGateway()
      await reconcileAfterCommand({ json: !!flags.json })

      if (flags.json) {
        console.log(JSON.stringify(response))
      } else {
        const urlInfo = response.url ? ` → ${response.url}` : ''
        console.log(
          `✓ ${projectPrefix}${serviceName} restarted successfully${urlInfo}`,
        )
        const showLocal =
          response.localUrl &&
          response.localUrl !== response.url &&
          (response.configPort === null ||
            response.configPort !== response.port)
        if (showLocal) {
          console.log(`  ↳ direct: ${response.localUrl}`)
        }
      }
      return { success: true, message: 'Service restarted successfully.' }
    }

    // Service failed to start
    if (flags.json) {
      console.log(JSON.stringify(response))
    } else {
      console.error(`✗ ${projectPrefix}${serviceName} failed to restart`)
      if (response?.logs && response.logs.length > 0) {
        console.error('')
        console.error('Recent logs:')
        for (const line of response.logs) {
          console.error(`  ${line}`)
        }
      }
    }
    return { success: false, message: 'Service failed to restart.' }
  },
})
