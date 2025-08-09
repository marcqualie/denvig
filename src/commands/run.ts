import { spawn } from 'node:child_process'

import { Command } from '../lib/command.ts'
import { getDenvigVersion } from '../lib/version.ts'

export const runCommand = new Command({
  name: 'run',
  description:
    'Run an action from the project. If no action is specified, lists available actions.',
  usage: 'run [action]',
  example: 'run build',
  args: [
    {
      name: 'action',
      description: 'The action to run (e.g. build, test, deploy)',
      required: false,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ project, args, extraArgs = [] }) => {
    if (!args.action) {
      console.log(`Denvig v${getDenvigVersion()}`)
      console.log('')
      console.log('Usage: denvig run [action] [...actionArgs]')
      console.log('')
      console.log(`Available actions:`)
      for (const action in project.actions) {
        if (!project.actions[action]) continue
        console.log(`  ${action}: ${project.actions[action]}`)
      }
      return { success: true, message: 'No action specified.' }
    }

    const action = project.actions[args.action]
    if (!action) {
      console.error(
        `Action "${args.action}" not found in project ${project.name}.`,
      )
      return { success: false, message: `Action "${args.action}" not found.` }
    }

    const commandToProxy = `${action} ${extraArgs.join(' ')}`.trim()
    console.log(`$ ${commandToProxy}`)

    // Prepare environment with color forcing for better terminal output
    const env = {
      ...process.env,
      DENVIG_PROJECT: project.slug,
    }

    // Check if we're in a TTY environment
    const isInteractive = process.stdout.isTTY && process.stdin.isTTY
    let commandName: string
    let commandArgs: string[]

    if (isInteractive) {
      // Use script command to preserve TTY behavior in interactive environments
      const os = process.platform
      if (os === 'darwin') {
        // macOS (BSD script): script [options] [file [command]]
        commandName = 'script'
        commandArgs = ['-q', '/dev/null', 'sh', '-c', commandToProxy]
      } else {
        // Linux (util-linux script): script [options] [file]
        commandName = 'script'
        commandArgs = ['-q', '-c', commandToProxy, '/dev/null']
      }
    } else {
      // Use direct execution in non-TTY environments (tests, CI, pipes)
      commandName = 'sh'
      commandArgs = ['-c', commandToProxy]
    }

    const child = spawn(commandName, commandArgs, {
      cwd: project.path,
      env,
      stdio: 'inherit',
    })

    const status = await new Promise<{ success: boolean }>((resolve) => {
      child.on('close', (code: number | null) => {
        resolve({ success: code === 0 })
      })
    })

    return status as { success: boolean }
  },
})
