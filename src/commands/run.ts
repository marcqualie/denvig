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
      ...Deno.env.toObject(),
      DENVIG_PROJECT: project.slug,
      // Force color output even when not in a TTY
      FORCE_COLOR: '1',
      // cSpell:ignore CLICOLOR
      CLICOLOR_FORCE: '1',
    }

    // Check if we're in a TTY environment
    const isInteractive = Deno.stdout.isTerminal() && Deno.stdin.isTerminal()
    let command: Deno.Command

    if (isInteractive) {
      // Use script command to preserve TTY behavior in interactive environments
      const os = Deno.build.os
      if (os === 'darwin') {
        // macOS (BSD script): script [options] [file [command]]
        command = new Deno.Command('script', {
          args: ['-q', '/dev/null', 'sh', '-c', commandToProxy],
          cwd: project.path,
          env,
          stdout: 'piped',
          stderr: 'piped',
        })
      } else {
        // Linux (util-linux script): script [options] [file]
        command = new Deno.Command('script', {
          args: ['-q', '-c', commandToProxy, '/dev/null'],
          cwd: project.path,
          env,
          stdout: 'piped',
          stderr: 'piped',
        })
      }
    } else {
      // Use direct execution in non-TTY environments (tests, CI, pipes)
      command = new Deno.Command('sh', {
        args: ['-c', commandToProxy],
        cwd: project.path,
        env,
        stdout: 'piped',
        stderr: 'piped',
      })
    }

    const child = command.spawn()

    const streamOutput = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        Deno.stdout.writeSync(value) // Direct binary write to stdout
      }
    }

    await Promise.all([streamOutput(child.stdout), streamOutput(child.stderr)])

    const status = await child.status

    return {
      success: status.success,
    }
  },
})
