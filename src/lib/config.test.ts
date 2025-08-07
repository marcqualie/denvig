import { expect } from 'jsr:@std/expect'
import { describe, it } from 'jsr:@std/testing/bdd'
import { stub } from 'jsr:@std/testing/mock'
import { stringify } from 'jsr:@std/yaml'

import { GLOBAL_CONFIG_PATH, getGlobalConfig, getProjectConfig } from './config'

const mockGlobalConfig = {
  codeRootDir: '/mock/code/root',
}

describe('getGlobalConfig()', () => {
  describe('root config file does not exist', () => {
    it('should return the default config', () => {
      const config = getGlobalConfig()
      expect(config.codeRootDir).toBeDefined()
    })
  })

  describe('valid root config file exists', () => {
    it('should return the config from the file', () => {
      using _stubbedReadFile = stub(
        Deno,
        'readTextFileSync',
        (path: string | URL) => {
          if (path === GLOBAL_CONFIG_PATH) return stringify(mockGlobalConfig)
          throw new Error(`File not found: ${path}`)
        },
      )

      const config = getGlobalConfig()
      expect(config.codeRootDir).toBe('/mock/code/root')
    })
  })
})

describe('getProjectConfig()', () => {
  it('should return a default project config if no config file exists', () => {
    const projectSlug = 'test-project'
    const config = getProjectConfig(projectSlug)
    expect(config.name).toBe(projectSlug)
    expect(config.actions).toEqual({})
  })

  it('should return the project config from the file if it exists', () => {
    const mockConfig = {
      name: 'test project',
      actions: {
        build: {
          command: 'deno task build',
        },
      },
    }
    using _stubbedReadFile = stub(Deno, 'readTextFileSync', (path) => {
      if (path === GLOBAL_CONFIG_PATH) return stringify(mockGlobalConfig)
      if (
        path ===
        `${getGlobalConfig().codeRootDir}/${mockConfig.name}/.denvig.yml`
      ) {
        return stringify(mockConfig)
      }
      throw new Error(`File not found: ${path}`)
    })

    const projectSlug = mockConfig.name
    const config = getProjectConfig(projectSlug)
    expect(config.name).toBe('test project')
    expect(config.actions?.build).toEqual({ command: 'deno task build' })
  })
})
