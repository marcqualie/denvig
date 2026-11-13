import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { createGlobalProject, mergeGlobalServices } from './global.ts'

describe('mergeGlobalServices()', () => {
  it('should include the built-in denvigd service', () => {
    deepStrictEqual(mergeGlobalServices(undefined).denvigd, {
      command: 'denvigd',
      keepAlive: true,
      startOnBoot: true,
    })
  })

  it('should let the global config override built-in fields', () => {
    const merged = mergeGlobalServices({
      denvigd: { command: 'denvigd --http 127.0.0.1:8100' },
    })
    strictEqual(merged.denvigd.command, 'denvigd --http 127.0.0.1:8100')
    strictEqual(merged.denvigd.keepAlive, true)
  })

  it('should keep services from the global config', () => {
    const merged = mergeGlobalServices({ ollama: { command: 'ollama serve' } })
    strictEqual(merged.ollama.command, 'ollama serve')
    ok(merged.denvigd)
  })
})

describe('createGlobalProject()', () => {
  let dir: string
  const originalConfigPath = process.env.DENVIG_GLOBAL_CONFIG_PATH

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'denvig-global-'))
    process.env.DENVIG_GLOBAL_CONFIG_PATH = join(dir, 'config.yml')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalConfigPath === undefined) {
      delete process.env.DENVIG_GLOBAL_CONFIG_PATH
    } else {
      process.env.DENVIG_GLOBAL_CONFIG_PATH = originalConfigPath
    }
  })

  it('should expose denvigd with an isolated cwd when no services are configured', async () => {
    const project = await createGlobalProject()
    const denvigd = project.config.services?.denvigd
    strictEqual(denvigd?.command, 'denvigd')
    ok(denvigd?.cwd?.endsWith('.denvigd/cwd'))
  })

  it('should merge configured services with the built-ins', async () => {
    writeFileSync(
      join(dir, 'config.yml'),
      'services:\n  ollama:\n    command: ollama serve\n',
    )
    const project = await createGlobalProject()
    deepStrictEqual(Object.keys(project.config.services ?? {}).sort(), [
      'denvigd',
      'ollama',
    ])
  })
})
