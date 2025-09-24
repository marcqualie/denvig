import { doesNotMatch, match, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { runTestCommand } from '../../utils/runTestCommand.ts'

describe('examples / pnpm / actions', () => {
  it('should run the package.json ls command', async () => {
    const result = await runTestCommand('denvig run ls', {
      cwd: 'src/test/examples/pnpm',
      env: {
        DENVIG_GLOBAL_CONFIG_PATH: `../../.denvig.global.test.yml`,
      },
    })

    strictEqual(result.stderr, '')
    match(result.stdout, /package\.json/)
    match(result.stdout, /\.denvig\.yml/)
    strictEqual(result.code, 0)
  })

  it('should run the custom denvig hello command', async () => {
    const result = await runTestCommand('denvig run hello', {
      cwd: 'src/test/examples/pnpm',
      env: {
        DENVIG_GLOBAL_CONFIG_PATH: `../../.denvig.global.test.yml`,
      },
    })

    match(result.stdout, /\$ pnpm run hello/)
    doesNotMatch(result.stdout, /\$ npm run hello/)
    match(result.stdout, /Hello from pnpm example!/)
    strictEqual(result.stderr, '')
    strictEqual(result.code, 0)
  })
})
