import { ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { formatCommandHelp, formatRootHelp, globalFlags } from './cli-help.ts'
import { Command } from './command.ts'

describe('cli-help', () => {
  describe('globalFlags', () => {
    it('should include project flag', () => {
      const projectFlag = globalFlags.find((f) => f.name === 'project')
      ok(projectFlag, 'project flag should exist')
      strictEqual(projectFlag.type, 'string')
    })

    it('should include json flag', () => {
      const jsonFlag = globalFlags.find((f) => f.name === 'json')
      ok(jsonFlag, 'json flag should exist')
      strictEqual(jsonFlag.type, 'boolean')
    })
  })

  describe('formatRootHelp()', () => {
    const mockCommands = {
      version: new Command({
        name: 'version',
        description: 'Show version',
        usage: 'version',
        example: 'version',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
      services: new Command({
        name: 'services',
        description: 'List services',
        usage: 'services',
        example: 'services',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
      'internals:test': new Command({
        name: 'internals:test',
        description: 'Internal command',
        usage: 'internals:test',
        example: 'internals:test',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      }),
    }

    it('should include version header', () => {
      const lines = formatRootHelp(mockCommands)
      ok(lines[0].startsWith('Denvig v'), 'should start with version')
    })

    it('should include Commands section', () => {
      const lines = formatRootHelp(mockCommands)
      ok(lines.includes('Commands:'), 'should include Commands header')
    })

    it('should include Options section', () => {
      const lines = formatRootHelp(mockCommands)
      ok(lines.includes('Options:'), 'should include Options header')
    })

    it('should show commands with denvig prefix', () => {
      const lines = formatRootHelp(mockCommands)
      const versionLine = lines.find((l) => l.includes('denvig version'))
      ok(versionLine, 'should include denvig version command')
    })

    it('should hide internal commands', () => {
      const lines = formatRootHelp(mockCommands)
      const internalLine = lines.find((l) => l.includes('internals:'))
      strictEqual(
        internalLine,
        undefined,
        'should not include internal commands',
      )
    })
  })

  describe('formatCommandHelp()', () => {
    it('should format basic command', () => {
      const command = new Command({
        name: 'test',
        description: 'A test command',
        usage: 'test',
        example: 'test',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      })

      const lines = formatCommandHelp(command)
      ok(lines.includes('Usage: denvig test'), 'should include usage')
      ok(lines.includes('A test command'), 'should include description')
    })

    it('should include arguments section when present', () => {
      const command = new Command({
        name: 'test',
        description: 'A test command',
        usage: 'test <name>',
        example: 'test foo',
        args: [
          {
            name: 'name',
            description: 'The name argument',
            required: true,
            type: 'string',
          },
        ],
        flags: [],
        handler: () => ({ success: true }),
      })

      const lines = formatCommandHelp(command)
      ok(lines.includes('Arguments:'), 'should include Arguments header')
      ok(
        lines.some((l) => l.includes('name')),
        'should include argument name',
      )
    })

    it('should mark optional arguments', () => {
      const command = new Command({
        name: 'test',
        description: 'A test command',
        usage: 'test [name]',
        example: 'test',
        args: [
          {
            name: 'name',
            description: 'Optional name',
            required: false,
            type: 'string',
          },
        ],
        flags: [],
        handler: () => ({ success: true }),
      })

      const lines = formatCommandHelp(command)
      ok(
        lines.some((l) => l.includes('(optional)')),
        'should mark optional arguments',
      )
    })

    it('should include command-specific flags', () => {
      const command = new Command({
        name: 'test',
        description: 'A test command',
        usage: 'test [--verbose]',
        example: 'test --verbose',
        args: [],
        flags: [
          {
            name: 'verbose',
            description: 'Enable verbose output',
            required: false,
            type: 'boolean',
          },
        ],
        handler: () => ({ success: true }),
      })

      const lines = formatCommandHelp(command)
      ok(lines.includes('Options:'), 'should include Options header')
      ok(
        lines.some((l) => l.includes('--verbose')),
        'should include verbose flag',
      )
    })

    it('should include example section', () => {
      const command = new Command({
        name: 'test',
        description: 'A test command',
        usage: 'test',
        example: 'test --verbose',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      })

      const lines = formatCommandHelp(command)
      ok(lines.includes('Example:'), 'should include Example header')
      ok(
        lines.some((l) => l.includes('denvig test --verbose')),
        'should include example with denvig prefix',
      )
    })

    it('should not duplicate denvig prefix in example', () => {
      const command = new Command({
        name: 'test',
        description: 'A test command',
        usage: 'test',
        example: 'denvig test --verbose',
        args: [],
        flags: [],
        handler: () => ({ success: true }),
      })

      const lines = formatCommandHelp(command)
      const exampleLine = lines.find((l) => l.includes('test --verbose'))
      ok(exampleLine, 'should include example')
      strictEqual(
        exampleLine?.includes('denvig denvig'),
        false,
        'should not duplicate denvig prefix',
      )
    })
  })
})
