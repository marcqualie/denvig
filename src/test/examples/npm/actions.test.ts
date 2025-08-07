import { expect } from 'jsr:@std/expect'
import { describe, it } from 'jsr:@std/testing/bdd'

import { runTestCommand } from '../../utils/runTestCommand.ts'

describe('examples / npm / actions', () => {
  it('should run the package.json ls command', async () => {
    const result = await runTestCommand('denvig run ls', {
      cwd: 'src/test/examples/npm',
      env: {
        DENVIG_GLOBAL_CONFIG_PATH: `../../.denvig.global.test.yml`,
      },
    })

    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('package.json')
    expect(result.stdout).toContain('.denvig.yml')
    expect(result.code).toBe(0)
  })

  it('should run the custom denvig hello command', async () => {
    const result = await runTestCommand('denvig run hello', {
      cwd: 'src/test/examples/npm',
      env: {
        DENVIG_GLOBAL_CONFIG_PATH: `../../.denvig.global.test.yml`,
      },
    })

    console.log('$ denvig run hello')
    console.log(`| code: ${result.code}`)
    console.log(
      '|- stdout:',
      result.stdout
        .split('\n')
        .map((line) => `\n|    ${line}`)
        .join(''),
    )
    console.log(
      '|- stderr:\n',
      result.stderr
        .split('\n')
        .map((line) => `\n|    ${line}`)
        .join(''),
    )

    expect(result.stdout).toContain('Hello from npm example!')
    expect(result.stderr).toBe('')
    expect(result.code).toBe(0)
  })
})
