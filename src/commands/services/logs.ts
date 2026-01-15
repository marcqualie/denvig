import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

import { Command } from '../../lib/command.ts'
import { ServiceManager } from '../../lib/services/manager.ts'

export const logsCommand = new Command({
  name: 'services:logs',
  description: 'Show logs for a service',
  usage: 'services logs <name> [-n <lines>] [--follow]',
  example: 'services logs api -n 50 --follow',
  args: [
    {
      name: 'name',
      description: 'Name of the service',
      required: true,
      type: 'string',
    },
  ],
  flags: [
    {
      name: 'lines',
      description: 'Number of lines to show (use -n)',
      required: false,
      type: 'number',
      defaultValue: 10,
    },
    {
      name: 'follow',
      description: 'Follow the log output',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ project, args, flags }) => {
    const manager = new ServiceManager(project)
    const name = args.name as string
    // Support alias `-n` through `flags.n` for compatibility with common CLI usage
    const lines = (flags.lines as number) ?? (flags.n as number) ?? 10
    const follow = !!flags.follow

    const logPath = manager.getLogPath(name, 'stdout')

    if (follow) {
      // Use system tail for follow behavior — acceptable on macOS
      const tailArgs = ['-n', `${lines}`, '-f', logPath]
      spawn('tail', tailArgs, { stdio: 'inherit' })

      // Return a Promise that never resolves until the process is killed by the user
      return new Promise(() => {
        /* keep process alive */
      }) as unknown as { success: boolean; message?: string }
    }

    try {
      const content = await readFile(logPath, 'utf-8')
      const allLines = content.trim().split('\n').filter(Boolean)
      const toShow = allLines.slice(-lines)
      for (const line of toShow) {
        console.log(line)
      }
      return { success: true }
    } catch (e) {
      console.error(
        `Failed to read logs for ${name}:`,
        e instanceof Error ? e.message : e,
      )
      return { success: false, message: 'failed to read logs' }
    }
  },
})
