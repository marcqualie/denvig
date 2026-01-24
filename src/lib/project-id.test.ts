import { deepStrictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseProjectId } from './project-id.ts'

describe('parseProjectId()', () => {
  describe('id: prefix', () => {
    it('parses id:[id] format', () => {
      const result = parseProjectId('id:abc123')
      deepStrictEqual(result, { type: 'id', value: 'abc123' })
    })

    it('parses id:[id]/[serviceName] format', () => {
      const result = parseProjectId('id:abc123/myservice')
      deepStrictEqual(result, {
        type: 'id',
        value: 'abc123',
        serviceName: 'myservice',
      })
    })

    it('handles short IDs', () => {
      const result = parseProjectId('id:a1b2c3d4')
      deepStrictEqual(result, { type: 'id', value: 'a1b2c3d4' })
    })
  })

  describe('github: prefix', () => {
    it('parses github:[slug] format', () => {
      const result = parseProjectId('github:owner/repo')
      deepStrictEqual(result, { type: 'github', value: 'owner/repo' })
    })

    it('parses github:[slug]/[serviceName] format', () => {
      const result = parseProjectId('github:owner/repo/myservice')
      deepStrictEqual(result, {
        type: 'github',
        value: 'owner/repo',
        serviceName: 'myservice',
      })
    })

    it('handles slugs with just owner', () => {
      const result = parseProjectId('github:owner')
      deepStrictEqual(result, { type: 'github', value: 'owner' })
    })
  })

  describe('local: prefix', () => {
    it('parses local:/path format', () => {
      const result = parseProjectId('local:/Users/marc/projects/myapp')
      deepStrictEqual(result, {
        type: 'local',
        value: '/Users/marc/projects/myapp',
      })
    })

    it('parses local:~/path format', () => {
      const result = parseProjectId('local:~/projects/myapp')
      deepStrictEqual(result, { type: 'local', value: '~/projects/myapp' })
    })

    it('handles paths with multiple segments', () => {
      const result = parseProjectId('local:/a/b/c/d/e')
      deepStrictEqual(result, { type: 'local', value: '/a/b/c/d/e' })
    })
  })

  describe('absolute paths', () => {
    it('parses absolute paths starting with /', () => {
      const result = parseProjectId('/Users/marc/projects/myapp')
      deepStrictEqual(result, {
        type: 'path',
        value: '/Users/marc/projects/myapp',
      })
    })

    it('parses home-relative paths starting with ~', () => {
      const result = parseProjectId('~/projects/myapp')
      deepStrictEqual(result, { type: 'path', value: '~/projects/myapp' })
    })
  })

  describe('unprefixed slugs (default to github)', () => {
    it('parses [slug] as github slug', () => {
      const result = parseProjectId('owner/repo')
      deepStrictEqual(result, { type: 'github', value: 'owner/repo' })
    })

    it('parses [slug]/[serviceName] format', () => {
      const result = parseProjectId('marcqualie/denvig/hello')
      deepStrictEqual(result, {
        type: 'github',
        value: 'marcqualie/denvig',
        serviceName: 'hello',
      })
    })

    it('handles single part as github slug', () => {
      const result = parseProjectId('myproject')
      deepStrictEqual(result, { type: 'github', value: 'myproject' })
    })
  })

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = parseProjectId('')
      deepStrictEqual(result, { type: 'github', value: '' })
    })

    it('handles service names with slashes', () => {
      const result = parseProjectId('owner/repo/services/api')
      deepStrictEqual(result, {
        type: 'github',
        value: 'owner/repo',
        serviceName: 'services/api',
      })
    })

    it('handles id with empty service name', () => {
      const result = parseProjectId('id:abc123/')
      deepStrictEqual(result, {
        type: 'id',
        value: 'abc123',
        serviceName: '',
      })
    })
  })
})
