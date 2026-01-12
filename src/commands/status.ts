import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { z } from 'zod'

import { Command } from '../lib/command.ts'
import { getServiceContext } from '../lib/services/identifier.ts'

export const statusCommand = new Command({
  name: 'status',
  description: 'Show status of a specific service',
  usage: 'status <name>',
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
  flags: [],
  handler: async ({ project, args }) => {
    const serviceArg = z.string().parse(args.name)
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
      console.error(
        `Service "${serviceName}" not found in configuration${projectInfo}`,
      )
      return {
        success: false,
        message: `Service "${serviceName}" not found.`,
      }
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
