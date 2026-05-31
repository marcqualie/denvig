import { deepStrictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { Command } from '../command.ts'
import { zshCompletionsFor } from './completions.ts'

import type { GenericCommand } from '../command.ts'

/** Minimal mock commands tree for testing */
const mockCommands: Record<string, GenericCommand> = {
  services: new Command({
    name: 'services',
    description: 'List services',
    usage: 'services',
    example: 'services',
    args: [],
    flags: [],
    subcommands: {
      start: new Command({
        name: 'services:start',
        description: 'Start a service',
        usage: 'services start <name>',
        example: 'services start web',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
      stop: new Command({
        name: 'services:stop',
        description: 'Stop a service',
        usage: 'services stop <name>',
        example: 'services stop web',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
      restart: new Command({
        name: 'services:restart',
        description: 'Restart a service',
        usage: 'services restart <name>',
        example: 'services restart web',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
      status: new Command({
        name: 'services:status',
        description: 'Service status',
        usage: 'services status <name>',
        example: 'services status web',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
      logs: new Command({
        name: 'services:logs',
        description: 'View logs',
        usage: 'services logs <name>',
        example: 'services logs web',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
      teardown: new Command({
        name: 'services:teardown',
        description: 'Teardown services',
        usage: 'services teardown',
        example: 'services teardown',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
    },
    handler: () => ({ success: true }),
  }),
  certs: new Command({
    name: 'certs',
    description: 'List certs',
    usage: 'certs',
    example: 'certs',
    args: [],
    flags: [],
    subcommands: {
      ca: new Command({
        name: 'certs:ca',
        description: 'Manage CA',
        usage: 'certs ca',
        example: 'certs ca info',
        args: [],
        flags: [],
        subcommands: {
          install: new Command({
            name: 'certs:ca:install',
            description: 'Install CA',
            usage: 'certs ca install',
            example: 'certs ca install',
            args: [],
            flags: [],
            handler: () => ({ success: true }),
          }),
          uninstall: new Command({
            name: 'certs:ca:uninstall',
            description: 'Uninstall CA',
            usage: 'certs ca uninstall',
            example: 'certs ca uninstall',
            args: [],
            flags: [],
            handler: () => ({ success: true }),
          }),
          info: new Command({
            name: 'certs:ca:info',
            description: 'CA info',
            usage: 'certs ca info',
            example: 'certs ca info',
            args: [],
            flags: [],
            handler: () => ({ success: true }),
          }),
        },
        handler: () => ({ success: true }),
      }),
      init: new Command({
        name: 'certs:init',
        description: 'Init certs',
        usage: 'certs init',
        example: 'certs init',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
    },
    handler: () => ({ success: true }),
  }),
  config: new Command({
    name: 'config',
    description: 'Show config',
    usage: 'config',
    example: 'config',
    args: [],
    flags: [],
    subcommands: {
      verify: new Command({
        name: 'config:verify',
        description: 'Verify config',
        usage: 'config verify',
        example: 'config verify',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
    },
    handler: () => ({ success: true }),
  }),
  deps: new Command({
    name: 'deps',
    description: 'List deps',
    usage: 'deps',
    example: 'deps',
    args: [],
    flags: [],
    subcommands: {
      outdated: new Command({
        name: 'deps:outdated',
        description: 'Outdated deps',
        usage: 'deps outdated',
        example: 'deps outdated',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
      why: new Command({
        name: 'deps:why',
        description: 'Why dep',
        usage: 'deps why',
        example: 'deps why',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
    },
    handler: () => ({ success: true }),
  }),
  version: new Command({
    name: 'version',
    description: 'Show version',
    usage: 'version',
    example: 'version',
    args: [],
    flags: [],
    handler: () => ({ success: true }),
  }),
  info: new Command({
    name: 'info',
    description: 'Show info',
    usage: 'info',
    example: 'info',
    args: [],
    flags: [],
    handler: () => ({ success: true }),
  }),
  outdated: new Command({
    name: 'outdated',
    description: 'Outdated alias',
    usage: 'outdated',
    example: 'outdated',
    args: [],
    flags: [],
    handler: () => ({ success: true }),
  }),
  plugins: new Command({
    name: 'plugins',
    description: 'Show plugins',
    usage: 'plugins',
    example: 'plugins',
    args: [],
    flags: [],
    handler: () => ({ success: true }),
  }),
  projects: new Command({
    name: 'projects',
    description: 'List projects',
    usage: 'projects',
    example: 'projects',
    args: [],
    flags: [],
    handler: () => ({ success: true }),
  }),
  run: new Command({
    name: 'run',
    description: 'Run action',
    usage: 'run',
    example: 'run',
    args: [],
    flags: [],
    handler: () => ({ success: true }),
  }),
  zsh: new Command({
    name: 'zsh',
    description: 'Zsh integration',
    usage: 'zsh',
    example: 'zsh',
    args: [],
    flags: [],
    subcommands: {
      completions: new Command({
        name: 'zsh:completions',
        description: 'Output completions',
        usage: 'zsh completions',
        example: 'zsh completions',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
    },
    handler: () => ({ success: true }),
  }),
}

const rootCommandNames = Object.keys(mockCommands)

describe('completions / zshCompletionsFor()', () => {
  it('should return the root commands when no subcommand is provided', async () => {
    const completions = await zshCompletionsFor(['denvig'], {
      commands: mockCommands,
    } as never)
    deepStrictEqual(completions, rootCommandNames)
  })

  it('should return the filtered list when a subcommand is partially provided', async () => {
    const completions = await zshCompletionsFor(['denvig', 'ser'], {
      commands: mockCommands,
    } as never)
    deepStrictEqual(completions, ['services'])
  })

  it('should returns the subcommands for a given root command', async () => {
    const completions = await zshCompletionsFor(['denvig', 'services'], {
      commands: mockCommands,
    } as never)
    deepStrictEqual(completions, [
      'start',
      'stop',
      'restart',
      'status',
      'logs',
      'teardown',
    ])
  })

  it('should return the filtered subcommands for a given root command and partial subcommand', async () => {
    const completions = await zshCompletionsFor(['denvig', 'services', 'sta'], {
      commands: mockCommands,
    } as never)
    deepStrictEqual(completions, ['start', 'status'])
  })
})
