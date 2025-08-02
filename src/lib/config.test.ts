import { expect } from 'jsr:@std/expect'
import { describe, it } from 'jsr:@std/testing/bdd'
import { stub } from 'jsr:@std/testing/mock'
import { stringify } from 'jsr:@std/yaml'

import { GLOBAL_CONFIG_PATH, getGlobalConfig } from './config.ts'

describe('getGlobalConfig()', () => {
  describe('root config file does not exist', () => {
    it('should return the default config', () => {
      const config = getGlobalConfig()
      expect(config.codeRootDir).toBeDefined()
    })
  })

  describe('valid root config file exists', () => {
    it('should return the config from the file', () => {
      const mockConfig = {
        codeRootDir: '/mock/code/root',
      }
      using _stubbedReadFile = stub(
        Deno,
        'readTextFileSync',
        (path: string | URL) => {
          if (path === GLOBAL_CONFIG_PATH) return stringify(mockConfig)
          throw new Deno.errors.NotFound()
        },
      )

      const config = getGlobalConfig()
      expect(config.codeRootDir).toBe('/mock/code/root')
    })
  })
})
