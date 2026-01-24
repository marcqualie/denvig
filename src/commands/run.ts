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
  completions: async ({ project }) => {
    const actions = await project.actions
    return Object.keys(actions)
  },
  handler: async ({ project, args, flags, extraArgs = [] }) => {
    const actions = await project.actions

    if (!args.action) {
      if (flags.json) {
        console.log(JSON.stringify({ actions }))
        return { success: true, message: 'Actions listed.' }
      }

      console.log(`Denvig v${getDenvigVersion()}`)
      console.log('')
      console.log('Usage: denvig run [action] [...actionArgs]')
      console.log('')
      console.log(`Available actions:`)
      for (const action in actions) {
        if (!actions[action]) continue
        const commands = actions[action]
        for (const command of commands) {
          const lines = command.split('\n')
          const firstLine = lines[0]
          const remainingLines = lines.slice(1)

          console.log(`  ${action}: ${firstLine}`)
          for (const line of remainingLines) {
            if (line.trim()) {
              console.log(`${' '.repeat(action.length + 4)}${line}`)
            }
          }
        }
      }
      return { success: true, message: 'No action specified.' }
    }

    const commands = actions[args.action]
    if (!commands) {
      console.error(
        `Action "${args.action}" not found in project ${project.name}.`,
      )
      return { success: false, message: `Action "${args.action}" not found.` }
    }

    let status = { success: true }
    for (const command of commands) {
      const commandToProxy = `${command} ${extraArgs.join(' ')}`.trim()
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

      const commandStatus = await new Promise<{ success: boolean }>(
        (resolve) => {
          child.on('close', (code: number | null) => {
            resolve({ success: code === 0 })
          })
        },
      )
      if (!commandStatus.success) {
        status = commandStatus
      }
    }

    return status
  },
})
