import { Command } from '../lib/command.ts'

export const runCommand = new Command({
  name: 'run',
  description:
    'Run an action against the project. Common defaults are auto detected.',
  example: 'denvig run build',
  args: [
    {
      name: 'action',
      description: 'The action to run (e.g. build, test, deploy)',
      required: false,
      type: 'string',
    },
  ],
  flags: [
    {
      name: 'project',
      description:
        'The project slug to run the action against. Defaults to current directory.',
      required: false,
      type: 'string',
    },
  ],
  handler: async (project, args) => {
    if (!args.action) {
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

    console.log(`$ ${action}`)
    const command = new Deno.Command('script', {
      args: ['-q', '/dev/null', 'sh', '-c', action],
      cwd: project.path,
      env: {
        ...Deno.env.toObject(),
        DENVIG_PROJECT: project.slug,
      },
      stdout: 'piped',
      stderr: 'piped',
    })

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
