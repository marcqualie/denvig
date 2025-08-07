import { expect } from 'jsr:@std/expect'
import { describe, it } from 'jsr:@std/testing/bdd'

import { runTestCommand } from '../../utils/runTestCommand.ts'

describe('examples / pnpm / actions', () => {
  it('should run the ls command in the pnpm example project', async () => {
    const result = await runTestCommand('denvig run ls', {
      cwd: 'src/test/examples/pnpm',
      env: {
        DENVIG_GLOBAL_CONFIG_PATH: `../../.denvig.global.test.yml`,
      },
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('package.json')
    expect(result.stdout).toContain('.denvig.yml')
    expect(result.stderr).toBe('')
  })

  it('should run the ls command in the pnpm example project', async () => {
    const result = await runTestCommand('denvig run hello', {
      cwd: 'src/test/examples/pnpm',
      env: {
        DENVIG_GLOBAL_CONFIG_PATH: `../../.denvig.global.test.yml`,
      },
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Hello from pnpm example!')
    expect(result.stderr).toBe('')
  })
})
