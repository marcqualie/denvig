import { deepStrictEqual, match, strictEqual } from 'node:assert'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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

describe('commands / config verify', () => {
  const BASE = 'name: T\nservices:\n  api:\n    command: pnpm dev\n'

  const withProject = async (
    files: { base?: string; local?: string },
    fn: (dir: string) => Promise<void>,
  ): Promise<void> => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'denvig-verify-')))
    try {
      if (files.base !== undefined)
        writeFileSync(join(dir, '.denvig.yml'), files.base)
      if (files.local !== undefined)
        writeFileSync(join(dir, '.denvig.local.yml'), files.local)
      await fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const verifyJson = async (dir: string, path = '') => {
    const result = await runTestCommand(
      `denvig config verify ${path} --json`.replace(/\s+/g, ' ').trim(),
      { cwd: dir },
    )
    return { code: result.code, json: JSON.parse(result.stdout) }
  }

  it('omits local results when there is no local config', async () => {
    await withProject({ base: BASE }, async (dir) => {
      const { code, json } = await verifyJson(dir)
      strictEqual(code, 0)
      strictEqual(json.valid, true)
      strictEqual(json.local, undefined)
    })
  })

  it('verifies a valid local config merged onto the project config', async () => {
    await withProject(
      { base: BASE, local: 'services:\n  api:\n    http:\n      port: 4000\n' },
      async (dir) => {
        const { code, json } = await verifyJson(dir)
        strictEqual(code, 0)
        strictEqual(json.valid, true)
        strictEqual(json.local.valid, true)
      },
    )
  })

  it('reports corrupted YAML in the local config', async () => {
    await withProject(
      { base: BASE, local: 'services:\n  api: [oops\n' },
      async (dir) => {
        const { code, json } = await verifyJson(dir)
        strictEqual(code, 1)
        strictEqual(json.valid, false)
        strictEqual(json.local.valid, false)
        match(json.local.error, /Invalid YAML syntax/)
      },
    )
  })

  it('reports a local config that is not a mapping', async () => {
    await withProject({ base: BASE, local: '- name\n' }, async (dir) => {
      const { code, json } = await verifyJson(dir)
      strictEqual(code, 1)
      match(json.local.error, /must be a YAML mapping/)
    })
  })

  it('reports schema errors caused by the local config', async () => {
    await withProject(
      { base: BASE, local: 'services:\n  api:\n    command: null\n' },
      async (dir) => {
        const { code, json } = await verifyJson(dir)
        strictEqual(code, 1)
        deepStrictEqual(json.local.errors, [
          {
            path: 'services.api.command',
            message: 'command is required for host runtime services',
          },
        ])
      },
    )
  })

  it('verifies the local config directly when given its path', async () => {
    await withProject(
      { base: BASE, local: 'quickActions: dev\n' },
      async (dir) => {
        const { code, json } = await verifyJson(dir, '.denvig.local.yml')
        strictEqual(code, 1)
        strictEqual(json.path, join(dir, '.denvig.local.yml'))
        strictEqual(json.errors[0].path, 'quickActions')
      },
    )
  })

  it('reports a missing local config when given its path', async () => {
    await withProject({ base: BASE }, async (dir) => {
      const { code, json } = await verifyJson(dir, '.denvig.local.yml')
      strictEqual(code, 1)
      strictEqual(json.error, 'Config file not found.')
    })
  })
})
