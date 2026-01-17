import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { getServiceContext } from '../../lib/services/identifier.ts'

export const servicesStatusCommand = new Command({
  name: 'services:status',
  description: 'Show status of a specific service',
  usage: 'services status <name> [--format table|json]',
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
      name: 'format',
      description: 'Output format: table or json (default: table)',
      required: false,
      type: 'string',
      defaultValue: 'table',
    },
  ],
  completions: ({ project }) => {
    return Object.keys(project.services)
  },
  handler: async ({ project, args, flags }) => {
    const serviceArg = z.string().parse(args.name)
    const format = flags.format as string
    const {
      manager,
      serviceName,
      project: targetProject,
    } = getServiceContext(serviceArg, project)

    const response = await manager.getServiceResponse(serviceName, {
      includeLogs: true,
    })

    if (!response) {
      const projectInfo =
        targetProject.slug !== project.slug
          ? ` in project "${targetProject.slug}"`
          : ''
      if (format === 'json') {
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

    if (format === 'json') {
      console.log(JSON.stringify(response))
      return { success: true, message: 'Status retrieved successfully.' }
    }

    const projectPrefix =
      targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

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

    console.log(`Command: ${response.command}`)
    console.log(`CWD:     ${response.cwd.replace(homedir(), '~')}`)
    console.log(`Logs:    ${response.logPath.replace(homedir(), '~')}`)

    const plistPath = manager.getPlistPath(serviceName)
    if (existsSync(plistPath)) {
      console.log(`Plist:   ${plistPath.replace(homedir(), '~')}`)
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
