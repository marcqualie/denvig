import { homedir } from 'node:os'
import { z } from 'zod'

import { Command } from '../lib/command.ts'
import { ServiceManager } from '../lib/services/manager.ts'

export const statusCommand = new Command({
  name: 'status',
  description: 'Show status of a specific service',
  usage: 'status <name>',
  example: 'status api',
  args: [
    {
      name: 'name',
      description: 'Name of the service',
      required: true,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ project, args }) => {
    const manager = new ServiceManager(project)
    const serviceName = z.string().parse(args.name)
    const status = await manager.getServiceStatus(serviceName)

    if (!status) {
      console.error(`Service "${serviceName}" not found in configuration`)
      return {
        success: false,
        message: `Service "${serviceName}" not found.`,
      }
    }

    console.log(`Service: ${status.name}`)
    console.log(`Status:  ${status.running ? 'Running' : 'Stopped'}`)

    if (status.running && status.pid) {
      console.log(`PID:     ${status.pid}`)
    }

    console.log(`Command: ${status.command}`)
    console.log(`CWD:     ${status.cwd.replace(homedir(), '~')}`)
    console.log(`Logs:    ${status.logPath.replace(homedir(), '~')}`)

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
