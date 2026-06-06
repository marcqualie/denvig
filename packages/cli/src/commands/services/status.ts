import { homedir } from 'node:os'
import { getGlobalConfig, getNginxConfigPath } from '@denvig/sdk/unsafe'
import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { serviceCompletions } from '../../lib/zsh/service-completions.ts'

export const servicesStatusCommand = new Command({
  name: 'services:status',
  description: 'Show status of a specific service',
  usage: 'services status <name> [--worktree <branch>]',
  example: 'services status api or services status marcqualie/denvig/hello',
  args: [
    {
      name: 'name',
      description:
        'Service name or project/service path (e.g., hello or marcqualie/denvig/hello)',
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
  handler: async ({ sdk, project, worktree, args, flags }) => {
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

    const response = await manager.getServiceResponse(serviceName, {
      includeLogs: true,
    })

    if (!response) {
      const projectInfo =
        targetProject.slug !== activeWorktree.slug
          ? ` in project "${targetProject.slug}"`
          : ''
      if (flags.json) {
        console.log(
          JSON.stringify({
            success: false,
            service: serviceName,
            project: targetProject.slug,
            message: `Service "${serviceName}" not found in configuration${projectInfo}`,
          }),
        )
      } else {
        console.error(
          `Service "${serviceName}" not found in configuration${projectInfo}`,
        )
      }
      return {
        success: false,
        message: `Service "${serviceName}" not found.`,
      }
    }

    if (flags.json) {
      console.log(JSON.stringify(response))
      return { success: true, message: 'Status retrieved successfully.' }
    }

    const projectPrefix =
      targetProject.slug !== activeWorktree.slug ? `${targetProject.slug}/` : ''

    const statusText =
      response.status === 'running'
        ? 'Running'
        : response.status === 'error'
          ? 'Error'
          : 'Stopped'

    console.log(`Service: ${projectPrefix}${response.name}`)
    console.log(`Status:  ${statusText}`)

    if (response.status === 'running' && response.pid) {
      console.log(`PID:     ${response.pid}`)
    }

    if (response.url) {
      console.log(`URL:     ${response.url}`)
    }
    if (
      response.localUrl &&
      response.localUrl !== response.url &&
      (response.configPort === null || response.configPort !== response.port)
    ) {
      console.log(`Direct:  ${response.localUrl}`)
    }

    console.log(`Command: ${response.command}`)
    console.log(`CWD:     ${response.cwd.replace(homedir(), '~')}`)
    console.log(`Logs:    ${response.logPath.replace(homedir(), '~')}`)

    const plistPath = manager.getPlistPath(serviceName)
    if (await sdk.fs.pathExists(plistPath)) {
      console.log(`Plist:   ${plistPath.replace(homedir(), '~')}`)
    }

    // Show nginx config path if gateway is enabled and service has domain
    const globalConfig = await getGlobalConfig()
    const gateway = globalConfig.experimental?.gateway
    const serviceConfig = manager.getServiceConfig(serviceName)
    if (gateway?.enabled && serviceConfig?.http?.domain) {
      const nginxPath = getNginxConfigPath(
        targetProject.id,
        serviceName,
        gateway.configsPath,
      )
      if (await sdk.fs.pathExists(nginxPath)) {
        console.log(`Nginx:   ${nginxPath}`)
      }
    }

    if (
      response.lastExitCode !== null &&
      response.lastExitCode !== 0 &&
      response.status !== 'running'
    ) {
      console.log(`Last exit code: ${response.lastExitCode}`)
    }

    if (response.logs && response.logs.length > 0) {
      console.log('')
      console.log('Recent logs (last 10 lines):')
      for (const line of response.logs.slice(-10)) {
        console.log(`  ${line}`)
      }
    }

    return { success: true, message: 'Status retrieved successfully.' }
  },
})
