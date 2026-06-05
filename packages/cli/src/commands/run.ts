import { getDenvigVersion, wrapProject } from '@denvig/sdk/unsafe'

import { Command } from '../lib/command.ts'

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
  acceptsExtraArgs: true,
  completions: async ({ project }) => {
    const actions = await project.activeWorktree.actions
    return Object.keys(actions)
  },
  handler: async ({ project, worktree, args, flags, extraArgs = [] }) => {
    if (!args.action) {
      const actions = await worktree.actions

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

    const denvig = wrapProject(project, { client: 'cli', cwd: worktree.path })

    let action: Awaited<ReturnType<typeof denvig.actions.retrieve>>
    try {
      action = await denvig.actions.retrieve(args.action as string)
    } catch {
      console.error(
        `Action "${args.action}" not found in project ${worktree.name}.`,
      )
      return { success: false, message: `Action "${args.action}" not found.` }
    }

    const result = await action.run({ args: extraArgs })
    return { success: result.success }
  },
})
