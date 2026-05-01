import { Command } from '../../lib/command.ts'
import { runSystemConfigure } from '../../lib/system/configure.ts'

export const systemConfigureCommand = new Command({
  name: 'system:configure',
  description:
    'Walk through system setup checks and enable each feature interactively',
  usage: 'system configure',
  example: 'denvig system configure',
  args: [],
  flags: [],
  handler: async () => {
    await runSystemConfigure()
    return { success: true, message: 'System configuration complete' }
  },
})
