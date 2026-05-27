import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { ensureServiceCerts } from '../../lib/services/certs.ts'
import {
  getServiceCompletions,
  getServiceContext,
} from '../../lib/services/identifier.ts'
import { resolveWorktreeProject } from '../../lib/services/worktree.ts'
import { resolveServicePortForCli } from './_resolvePort.ts'

export const servicesStartCommand = new Command({
  name: 'services:start',
  description: 'Start a service',
  usage:
    'services start <name> [--worktree <branch>] [--random-port] [--claim-domain]',
  example: 'services start api',
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
  completions: ({ project }) => {
    return getServiceCompletions(project)
  },
  handler: async ({ project: currentProject, args, flags }) => {
    const serviceArg = z.string().parse(args.name)

    let project = currentProject
    if (typeof flags.worktree === 'string') {
      try {
        project = await resolveWorktreeProject(currentProject, flags.worktree)
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

    const {
      manager,
      serviceName,
      project: targetProject,
    } = await getServiceContext(serviceArg, project)

    const projectPrefix =
      targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

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
      console.log(`Starting ${projectPrefix}${serviceName}...`)
    }

    const result = await manager.startService(serviceName, {
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
          `✗ Failed to start ${projectPrefix}${serviceName}: ${result.message}`,
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

      if (flags.json) {
        console.log(JSON.stringify(response))
      } else {
        const urlInfo = response.url ? ` → ${response.url}` : ''
        console.log(
          `✓ ${projectPrefix}${serviceName} started successfully${urlInfo}`,
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
      return { success: true, message: 'Service started successfully.' }
    }

    // Service failed to start
    if (flags.json) {
      console.log(JSON.stringify(response))
    } else {
      console.error(`✗ ${projectPrefix}${serviceName} failed to start`)
      if (response?.logs && response.logs.length > 0) {
        console.error('')
        console.error('Recent logs:')
        for (const line of response.logs) {
          console.error(`  ${line}`)
        }
      }
    }
    return { success: false, message: 'Service failed to start.' }
  },
})
