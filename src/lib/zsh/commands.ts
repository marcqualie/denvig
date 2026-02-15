import type { GenericCommand } from '../command.ts'

/**
 * Dynamically imports and returns all commands for use in completions.
 */
export const getCommands = async (): Promise<
  Record<string, GenericCommand>
> => {
  const { runCommand } = await import('../../commands/run.ts')
  const { configCommand } = await import('../../commands/config.ts')
  const { pluginsCommand } = await import('../../commands/plugins.ts')
  const { versionCommand } = await import('../../commands/version.ts')
  const { infoCommand } = await import('../../commands/info.ts')
  const { servicesCommand } = await import('../../commands/services/list.ts')
  const { servicesStartCommand } = await import(
    '../../commands/services/start.ts'
  )
  const { servicesStopCommand } = await import(
    '../../commands/services/stop.ts'
  )
  const { servicesRestartCommand } = await import(
    '../../commands/services/restart.ts'
  )
  const { servicesStatusCommand } = await import(
    '../../commands/services/status.ts'
  )
  const { logsCommand } = await import('../../commands/services/logs.ts')
  const { servicesTeardownCommand } = await import(
    '../../commands/services/teardown.ts'
  )
  const { depsListCommand } = await import('../../commands/deps/list.ts')
  const { depsOutdatedCommand } = await import(
    '../../commands/deps/outdated.ts'
  )
  const { depsWhyCommand } = await import('../../commands/deps/why.ts')
  const { configVerifyCommand } = await import(
    '../../commands/config/verify.ts'
  )
  const { projectsListCommand } = await import(
    '../../commands/projects/list.ts'
  )
  const { certsListCommand } = await import('../../commands/certs/list.ts')
  const { certsInitCommand } = await import('../../commands/certs/init.ts')
  const { certsGenerateCommand } = await import(
    '../../commands/certs/generate.ts'
  )
  const { certsImportCommand } = await import('../../commands/certs/import.ts')
  const { certsRmCommand } = await import('../../commands/certs/rm.ts')
  const { certsCaInstallCommand } = await import(
    '../../commands/certs/ca/install.ts'
  )
  const { certsCaUninstallCommand } = await import(
    '../../commands/certs/ca/uninstall.ts'
  )
  const { certsCaInfoCommand } = await import('../../commands/certs/ca/info.ts')

  return {
    run: runCommand,
    config: configCommand,
    'config:verify': configVerifyCommand,
    plugins: pluginsCommand,
    version: versionCommand,
    info: infoCommand,
    services: servicesCommand,
    'services:start': servicesStartCommand,
    'services:stop': servicesStopCommand,
    'services:restart': servicesRestartCommand,
    'services:status': servicesStatusCommand,
    'services:logs': logsCommand,
    'services:teardown': servicesTeardownCommand,
    deps: depsListCommand,
    'deps:list': depsListCommand,
    'deps:outdated': depsOutdatedCommand,
    'deps:why': depsWhyCommand,
    projects: projectsListCommand,
    'projects:list': projectsListCommand,
    certs: certsListCommand,
    'certs:init': certsInitCommand,
    'certs:list': certsListCommand,
    'certs:generate': certsGenerateCommand,
    'certs:import': certsImportCommand,
    'certs:rm': certsRmCommand,
    'certs:ca:install': certsCaInstallCommand,
    'certs:ca:uninstall': certsCaUninstallCommand,
    'certs:ca:info': certsCaInfoCommand,
  }
}
