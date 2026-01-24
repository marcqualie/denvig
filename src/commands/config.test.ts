import { match, strictEqual } from 'node:assert'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { runTestCommand } from '../test/utils/runTestCommand.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('commands / config', () => {
  it('should return the global and project config without errors', async () => {
    const result = await runTestCommand('denvig config')

    strictEqual(result.code, 0)
    match(result.stdout, /Global:/)
    match(result.stdout, /Project:/)
    strictEqual(result.stderr, '')
  })

  it('should not output config warnings when using --json with invalid config', async () => {
    const testExamplesDir = resolve(__dirname, '../test/examples')
    const invalidConfigDir = resolve(testExamplesDir, 'invalid-config')

    const result = await runTestCommand('denvig version --json', {
      cwd: invalidConfigDir,
      env: {
        DENVIG_CODE_ROOT_DIR: testExamplesDir,
      },
    })

    strictEqual(result.code, 0)
    strictEqual(
      result.stderr,
      '',
      'stderr should be empty (no config warnings)',
    )

    // Verify the output is valid JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(result.stdout)
    } catch {
      throw new Error(`stdout is not valid JSON: ${result.stdout}`)
    }
    strictEqual(typeof parsed, 'object', 'JSON output should be an object')
  })
})
