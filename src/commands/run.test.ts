import { expect } from 'jsr:@std/expect'
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd'

import { runCommand } from './run.ts'

import type { DenvigProject } from '../lib/project.ts'

describe('runCommand', () => {
  let capturedArgs: string[] = []
  let originalCommand: typeof Deno.Command

  beforeEach(() => {
    capturedArgs = []
    originalCommand = Deno.Command

    // Mock Deno.Command to capture arguments
    const MockCommand = class {
      constructor(command: string, options: { args: string[] }) {
        capturedArgs = [command, ...options.args]
      }

      spawn() {
        return {
          stdout: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          stderr: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
          status: Promise.resolve({ success: true }),
        }
      }
    }

    // @ts-ignore: Temporarily override Deno.Command for testing
    Deno.Command = MockCommand as typeof Deno.Command
  })

  afterEach(() => {
    // Restore original Deno.Command
    Deno.Command = originalCommand
  })

  it('should pass extra arguments to the script command', async () => {
    // Mock project with a test action
    const mockProject = {
      name: 'test-project',
      slug: 'test-project',
      path: '/test/path',
      config: { name: 'test-project', $sources: [] },
      dependencies: [],
      actions: {
        build: 'npm run build',
      },
    } as DenvigProject

    // Test with extra arguments including flags
    const extraArgs = ['--verbose', '--output', 'dist/', 'file.txt']
    await runCommand.handler({ project: mockProject, args: { action: 'build' }, flags: {}, extraArgs })

    // Verify that the script command received the extra arguments as part of the command string
    expect(capturedArgs[0]).toBe('script')
    expect(capturedArgs[4]).toBe('-c')
    expect(capturedArgs[5]).toBe(
      'npm run build --verbose --output dist/ file.txt',
    )

    // Verify the full argument array structure
    expect(capturedArgs).toEqual([
      'script',
      '-q',
      '/dev/null',
      'sh',
      '-c',
      'npm run build --verbose --output dist/ file.txt',
    ])
  })

  it('should work without extra arguments', async () => {
    // Mock project with a test action
    const mockProject = {
      name: 'test-project',
      slug: 'test-project',
      path: '/test/path',
      config: { name: 'test-project', $sources: [] },
      dependencies: [],
      actions: {
        test: 'npm test',
      },
    } as DenvigProject

    // Test without extra arguments
    await runCommand.handler({ project: mockProject, args: { action: 'test' }, flags: {} })

    // Verify that the script command received the basic arguments
    expect(capturedArgs[0]).toBe('script')
    expect(capturedArgs).toEqual([
      'script',
      '-q',
      '/dev/null',
      'sh',
      '-c',
      'npm test',
    ])
  })

  it('should pass boolean flags correctly', async () => {
    // Mock project with a test action
    const mockProject = {
      name: 'test-project',
      slug: 'test-project',
      path: '/test/path',
      config: { name: 'test-project', $sources: [] },
      dependencies: [],
      actions: {
        lint: 'eslint .',
      },
    } as DenvigProject

    // Test with boolean flags (like --write, --fix)
    const extraArgs = ['--write', '--fix']
    await runCommand.handler({ project: mockProject, args: { action: 'lint' }, flags: {}, extraArgs })

    // Verify that the script command received the boolean flags as part of the command string
    expect(capturedArgs[0]).toBe('script')
    expect(capturedArgs[4]).toBe('-c')
    expect(capturedArgs[5]).toBe('eslint . --write --fix')

    expect(capturedArgs).toEqual([
      'script',
      '-q',
      '/dev/null',
      'sh',
      '-c',
      'eslint . --write --fix',
    ])
  })
})
