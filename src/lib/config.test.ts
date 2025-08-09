import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { getGlobalConfig, getProjectConfig } from './config.ts'

describe('getGlobalConfig()', () => {
  describe('root config file does not exist', () => {
    it('should return the default config', () => {
      const config = getGlobalConfig()
      ok(config.codeRootDir !== undefined)
    })
  })

  // TODO: Re-enable mocking tests when Node.js compatible mocking is implemented
  // describe('valid root config file exists', () => {
  //   it('should return the config from the file', () => {
  //     // Test disabled - needs Node.js compatible mocking
  //   })
  // })
})

describe('getProjectConfig()', () => {
  it('should return a default project config if no config file exists', () => {
    const projectSlug = 'test-project'
    const config = getProjectConfig(projectSlug)
    ok(config.name === projectSlug)
    ok(typeof config.actions === 'object')
  })

  // TODO: Re-enable mocking tests when Node.js compatible mocking is implemented
  // it('should return the project config from the file if it exists', () => {
  //   // Test disabled - needs Node.js compatible mocking
  // })
})
