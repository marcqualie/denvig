import { spawn } from 'node:child_process'
import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { ensureServiceCerts } from '../../lib/services/certs.ts'
import { resolveServicePortForCli } from '../../lib/services/resolvePort.ts'
import { serviceCompletions } from '../../lib/zsh/service-completions.ts'

type ForegroundExit = {
  code: number | null
  signal: NodeJS.Signals | null
  /**
   * True when the run was ended by the user (Ctrl+C) or a stop signal.
   */
  interrupted: boolean
}

/**
 * Run a command attached to the current terminal, resolving once it exits.
 *
 * Ctrl+C is delivered by the terminal to the whole foreground process group,
 * so the child already receives SIGINT directly — denvig just stays alive to
 * clean up once it exits. A second Ctrl+C force-kills a child that won't stop.
 * SIGTERM and SIGHUP sent to denvig itself are forwarded to the child.
 */
const runInForeground = (
  command: string,
  cwd: string,
  env: Record<string, string>,
): Promise<ForegroundExit> =>
  new Promise((resolve, reject) => {
    const child = spawn('/bin/zsh', ['-l', '-c', command], {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    })

    let interrupted = false
    const onInterrupt = () => {
      if (interrupted) child.kill('SIGKILL')
      interrupted = true
    }
    const onTerminate = (signal: NodeJS.Signals) => {
      interrupted = true
      child.kill(signal)
    }
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    process.on('SIGHUP', onTerminate)
    const detach = () => {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
      process.off('SIGHUP', onTerminate)
    }

    child.on('error', (error) => {
      detach()
      reject(error)
    })
    child.on('exit', (code, signal) => {
      detach()
      resolve({ code, signal, interrupted })
    })
  })

export const servicesRunCommand = new Command({
  name: 'services:run',
  description:
    'Run a service in the foreground, streaming its output until Ctrl+C',
  usage:
    'services run <name> [--worktree <branch>] [--port <port>] [--domains <list>] [--no-domains]',
  example: 'services run dev',
  args: [
    {
      name: 'name',
      description:
        'Service name or project/service path (e.g., api or marcqualie/denvig/hello)',
      required: true,
      type: 'string',
    },
  ],
  flags: [
    {
      name: 'worktree',
      description:
        'Target the service in a sibling git worktree by branch name (use "main" for the primary checkout)',
      required: false,
      type: 'string',
    },
    {
      name: 'port',
      description:
        'Port to run on, or "random" to allocate a free dev port; defaults to the configured port, falling back to a random one when busy',
      required: false,
      type: 'string',
    },
    {
      name: 'domains',
      description:
        'Comma-separated domains to route to this run, replacing the configured ones and claiming them from any current owner (handed back on exit)',
      required: false,
      type: 'string',
    },
    {
      name: 'no-domains',
      description:
        'Run without claiming any domain — run on the port only and leave any existing route owner in place (takes precedence over --domains)',
      required: false,
      type: 'boolean',
    },
  ],
  completions: ({ project, sdk }) => {
    return serviceCompletions(project, sdk)
  },
  handler: async ({ project, worktree, args, flags }) => {
    const serviceArg = z.string().parse(args.name)

    if (flags.json) {
      const message = 'JSON format is not supported with services run'
      console.log(JSON.stringify({ success: false, message }))
      return { success: false, message }
    }

    let activeWorktree = worktree
    if (typeof flags.worktree === 'string') {
      try {
        activeWorktree = project.selectWorktree(flags.worktree)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error(message)
        return { success: false, message }
      }
    }

    const { manager, serviceName, target } =
      await project.services.context(serviceArg)

    const projectPrefix =
      target.slug !== activeWorktree.slug ? `${target.slug}/` : ''
    const displayName = `${projectPrefix}${serviceName}`

    const serviceConfig = target.config.services?.[serviceName]
    if (serviceConfig) {
      await ensureServiceCerts(serviceName, serviceConfig, { json: false })
    }

    const portResolution = await resolveServicePortForCli(
      manager,
      serviceName,
      flags,
    )
    if (portResolution === null) {
      return { success: false, message: 'Port resolution aborted.' }
    }

    const domains =
      typeof flags.domains === 'string'
        ? flags.domains
            .split(',')
            .map((domain) => domain.trim())
            .filter(Boolean)
        : undefined

    const prepared = await manager.prepareForegroundRun(serviceName, {
      port: portResolution.port,
      domains: flags['no-domains']
        ? []
        : domains && domains.length > 0
          ? domains
          : undefined,
    })
    if (!prepared.success) {
      console.error(`✗ Failed to run ${displayName}: ${prepared.message}`)
      return { success: false, message: prepared.message }
    }

    let exit: ForegroundExit
    try {
      await manager.reconfigureGateway()
      const url = await manager.getServiceUrl(serviceName)
      const urlInfo = url ? ` → ${url}` : ''
      console.log(`▶ Running ${displayName}${urlInfo} (Ctrl+C to stop)`)

      exit = await runInForeground(prepared.command, prepared.cwd, prepared.env)
    } finally {
      await manager.finishForegroundRun(serviceName)
    }

    if (exit.interrupted || exit.code === 0) {
      console.log(`■ ${displayName} stopped`)
      return { success: true, message: 'Service stopped.' }
    }

    const reason =
      exit.code !== null
        ? `exited with code ${exit.code}`
        : `was killed by ${exit.signal}`
    console.error(`✗ ${displayName} ${reason}`)
    return { success: false, message: `Service ${reason}.` }
  },
})
