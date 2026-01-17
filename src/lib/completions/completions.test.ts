import { deepStrictEqual, ok } from 'node:assert'
import { describe, it } from 'node:test'

import { DenvigProject } from '../project.ts'
import { getCompletions } from './completions.ts'

describe('getCompletions()', () => {
  // Use the denvig project itself for testing
  const project = new DenvigProject('marcqualie/denvig')

  describe('top-level commands (denvig <tab>)', () => {
    it('should return commands when cursor is at position 2', async () => {
      const completions = await getCompletions({
        words: ['denvig'],
        cursor: 2,
        project,
      })

      const values = completions.map((c) => c.value)

      // Should include core commands
      ok(values.includes('run'), 'should include run command')
      ok(values.includes('services'), 'should include services command')
      ok(values.includes('deps'), 'should include deps command')
      ok(values.includes('config'), 'should include config command')
      ok(values.includes('version'), 'should include version command')
      ok(values.includes('zsh'), 'should include zsh command')
    })

    it('should include quickActions from the project', async () => {
      const completions = await getCompletions({
        words: ['denvig'],
        cursor: 2,
        project,
      })

      const values = completions.map((c) => c.value)

      // The denvig project has these quickActions defined in .denvig.yml
      ok(values.includes('check'), 'should include check quickAction')
      ok(values.includes('codegen'), 'should include codegen quickAction')
      ok(values.includes('compile'), 'should include compile quickAction')
      ok(values.includes('lint:fix'), 'should include lint:fix quickAction')
      ok(values.includes('test:ci'), 'should include test:ci quickAction')
    })

    it('should have descriptions for commands', async () => {
      const completions = await getCompletions({
        words: ['denvig'],
        cursor: 2,
        project,
      })

      const servicesCompletion = completions.find((c) => c.value === 'services')
      ok(servicesCompletion, 'should have services completion')
      ok(servicesCompletion.description, 'services should have a description')
    })
  })

  describe('services subcommands (denvig services <tab>)', () => {
    it('should return service subcommands when cursor is at position 3', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'services'],
        cursor: 3,
        project,
      })

      const values = completions.map((c) => c.value)

      deepStrictEqual(
        values.sort(),
        ['logs', 'restart', 'start', 'status', 'stop', 'teardown'],
        'should return all service subcommands',
      )
    })

    it('should have descriptions for service subcommands', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'services'],
        cursor: 3,
        project,
      })

      const startCompletion = completions.find((c) => c.value === 'start')
      ok(startCompletion, 'should have start completion')
      ok(startCompletion.description, 'start should have a description')
    })
  })

  describe('service names (denvig services start <tab>)', () => {
    it('should return service names when cursor is at position 4 after start', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'services', 'start'],
        cursor: 4,
        project,
      })

      const values = completions.map((c) => c.value)

      // The denvig project has hello and wontlaunch services defined
      ok(values.includes('hello'), 'should include hello service')
      ok(values.includes('wontlaunch'), 'should include wontlaunch service')
    })

    it('should return service names for stop command', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'services', 'stop'],
        cursor: 4,
        project,
      })

      const values = completions.map((c) => c.value)

      ok(values.includes('hello'), 'should include hello service')
      ok(values.includes('wontlaunch'), 'should include wontlaunch service')
    })

    it('should return service names for restart command', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'services', 'restart'],
        cursor: 4,
        project,
      })

      const values = completions.map((c) => c.value)

      ok(values.includes('hello'), 'should include hello service')
    })

    it('should return service names for logs command', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'services', 'logs'],
        cursor: 4,
        project,
      })

      const values = completions.map((c) => c.value)

      ok(values.includes('hello'), 'should include hello service')
    })

    it('should not return service names for status command', async () => {
      // status shows overall status, doesn't take a service name argument
      // Actually looking at the code, status does take a service name
      // Let me check the serviceCommands list
      const completions = await getCompletions({
        words: ['denvig', 'services', 'status'],
        cursor: 4,
        project,
      })

      const values = completions.map((c) => c.value)

      // status is not in serviceCommands list, so should return empty
      deepStrictEqual(values, [], 'status should not show service names')
    })
  })

  describe('deps subcommands (denvig deps <tab>)', () => {
    it('should return deps subcommands when cursor is at position 3', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'deps'],
        cursor: 3,
        project,
      })

      const values = completions.map((c) => c.value)

      deepStrictEqual(
        values.sort(),
        ['list', 'outdated', 'why'],
        'should return all deps subcommands',
      )
    })
  })

  describe('run action names (denvig run <tab>)', () => {
    it('should return action names when cursor is at position 3 after run', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'run'],
        cursor: 3,
        project,
      })

      const values = completions.map((c) => c.value)

      // The denvig project has these actions defined
      ok(values.includes('check'), 'should include check action')
      ok(values.includes('compile'), 'should include compile action')
      ok(
        values.includes('compile:darwin-x64'),
        'should include compile:darwin-x64 action',
      )
    })
  })

  describe('zsh subcommands (denvig zsh <tab>)', () => {
    it('should return zsh subcommands when cursor is at position 3', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'zsh'],
        cursor: 3,
        project,
      })

      const values = completions.map((c) => c.value)

      ok(values.includes('completions'), 'should include completions')
      ok(values.includes('__complete__'), 'should include __complete__')
    })
  })

  describe('edge cases', () => {
    it('should return empty array for unknown commands at position 3', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'unknown'],
        cursor: 3,
        project,
      })

      deepStrictEqual(
        completions,
        [],
        'should return empty for unknown command',
      )
    })

    it('should return empty array for position beyond supported', async () => {
      const completions = await getCompletions({
        words: ['denvig', 'version', 'extra'],
        cursor: 4,
        project,
      })

      deepStrictEqual(
        completions,
        [],
        'should return empty for unsupported position',
      )
    })
  })
})
