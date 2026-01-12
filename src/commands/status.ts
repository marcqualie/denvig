import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { z } from 'zod'

import { Command } from '../lib/command.ts'
import { getServiceContext } from '../lib/services/identifier.ts'

export const statusCommand = new Command({
  name: 'status',
  description: 'Show status of a specific service',
  usage: 'status <name> [--format table|json]',
  example: 'status api or status marcqualie/api/dev',
  args: [
    {
      name: 'name',
      description:
        'Service name or project/service path (e.g., hello or marcqualie/api/dev)',
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
  handler: async ({ project, args, flags }) => {
    const serviceArg = z.string().parse(args.name)
    const format = flags.format as string
    const {
      manager,
      serviceName,
      project: targetProject,
    } = getServiceContext(serviceArg, project)

    const status = await manager.getServiceStatus(serviceName)

    if (!status) {
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
      const plistPath = manager.getPlistPath(serviceName)
      console.log(
        JSON.stringify({
          success: true,
          service: serviceName,
          project: targetProject.slug,
          running: status.running,
          pid: status.pid || null,
          command: status.command,
          cwd: status.cwd,
          logPath: status.logPath,
          plistPath: existsSync(plistPath) ? plistPath : null,
          lastExitCode: status.lastExitCode ?? null,
          logs: status.logs || [],
        }),
      )
      return { success: true, message: 'Status retrieved successfully.' }
    }

    const projectPrefix =
      targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

    console.log(`Service: ${projectPrefix}${status.name}`)
    console.log(`Status:  ${status.running ? 'Running' : 'Stopped'}`)

    if (status.running && status.pid) {
      console.log(`PID:     ${status.pid}`)
    }

    console.log(`Command: ${status.command}`)
    console.log(`CWD:     ${status.cwd.replace(homedir(), '~')}`)
    console.log(`Logs:    ${status.logPath.replace(homedir(), '~')}`)

    const plistPath = manager.getPlistPath(serviceName)
    if (existsSync(plistPath)) {
      console.log(`Plist:   ${plistPath.replace(homedir(), '~')}`)
    }

    if (status.lastExitCode !== undefined && !status.running) {
      console.log(`Last exit code: ${status.lastExitCode}`)
    }

    if (status.logs && status.logs.length > 0) {
      console.log('')
      console.log('Recent logs (last 10 lines):')
      for (const line of status.logs) {
        console.log(`  ${line}`)
      }
    }

    return { success: true, message: 'Status retrieved successfully.' }
  },
})
