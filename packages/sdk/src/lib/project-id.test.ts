import { deepStrictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { resolveGitProviders } from './project/git-providers.ts'
import { parseProjectId, stripSlugPrefix } from './project-id.ts'

const providers = resolveGitProviders({
  'gitea-mqn': {
    type: 'gitea',
    url: 'https://gitea.example.com/{{owner}}/{{repo}}',
    name: 'Gitea',
  },
  'git-vps': {
    type: 'git',
    url: 'https://vps.example.com/{{repo}}',
    name: 'Git VPS',
  },
})

describe('parseProjectId()', () => {
  describe('id: prefix', () => {
    it('parses id:[id] format', () => {
      const result = parseProjectId('id:abc123', providers)
      deepStrictEqual(result, { type: 'id', value: 'abc123' })
    })

    it('parses id:[id]/[serviceName] format', () => {
      const result = parseProjectId('id:abc123/myservice', providers)
      deepStrictEqual(result, {
        type: 'id',
        value: 'abc123',
        serviceName: 'myservice',
      })
    })

    it('handles short IDs', () => {
      const result = parseProjectId('id:a1b2c3d4', providers)
      deepStrictEqual(result, { type: 'id', value: 'a1b2c3d4' })
    })
  })

  describe('github: prefix', () => {
    it('parses github:[slug] format', () => {
      const result = parseProjectId('github:owner/repo', providers)
      deepStrictEqual(result, {
        type: 'slug',
        provider: 'github',
        value: 'owner/repo',
      })
    })

    it('parses github:[slug]/[serviceName] format', () => {
      const result = parseProjectId('github:owner/repo/myservice', providers)
      deepStrictEqual(result, {
        type: 'slug',
        provider: 'github',
        value: 'owner/repo',
        serviceName: 'myservice',
      })
    })

    it('handles slugs with just owner', () => {
      const result = parseProjectId('github:owner', providers)
      deepStrictEqual(result, {
        type: 'slug',
        provider: 'github',
        value: 'owner',
      })
    })
  })

  describe('custom provider prefixes', () => {
    it('parses an owner/repo provider slug', () => {
      const result = parseProjectId('gitea-mqn:owner/repo', providers)
      deepStrictEqual(result, {
        type: 'slug',
        provider: 'gitea-mqn',
        value: 'owner/repo',
      })
    })

    it('parses an owner/repo provider slug with a service', () => {
      const result = parseProjectId('gitea-mqn:owner/repo/web', providers)
      deepStrictEqual(result, {
        type: 'slug',
        provider: 'gitea-mqn',
        value: 'owner/repo',
        serviceName: 'web',
      })
    })

    it('parses a repo-only provider slug with a service', () => {
      const result = parseProjectId('git-vps:repo/web', providers)
      deepStrictEqual(result, {
        type: 'slug',
        provider: 'git-vps',
        value: 'repo',
        serviceName: 'web',
      })
    })

    it('does not treat unknown prefixes as providers', () => {
      const result = parseProjectId('unknown:owner/repo', providers)
      deepStrictEqual(result, { type: 'slug', value: 'unknown:owner/repo' })
    })
  })

  describe('local: prefix', () => {
    it('parses local:/path format', () => {
      const result = parseProjectId(
        'local:/Users/marc/projects/myapp',
        providers,
      )
      deepStrictEqual(result, {
        type: 'local',
        value: '/Users/marc/projects/myapp',
      })
    })

    it('parses local:~/path format', () => {
      const result = parseProjectId('local:~/projects/myapp', providers)
      deepStrictEqual(result, { type: 'local', value: '~/projects/myapp' })
    })

    it('handles paths with multiple segments', () => {
      const result = parseProjectId('local:/a/b/c/d/e', providers)
      deepStrictEqual(result, { type: 'local', value: '/a/b/c/d/e' })
    })
  })

  describe('absolute paths', () => {
    it('parses absolute paths starting with /', () => {
      const result = parseProjectId('/Users/marc/projects/myapp', providers)
      deepStrictEqual(result, {
        type: 'path',
        value: '/Users/marc/projects/myapp',
      })
    })

    it('parses home-relative paths starting with ~', () => {
      const result = parseProjectId('~/projects/myapp', providers)
      deepStrictEqual(result, { type: 'path', value: '~/projects/myapp' })
    })
  })

  describe('unprefixed slugs (match any provider)', () => {
    it('parses [slug] as an unprefixed slug', () => {
      const result = parseProjectId('owner/repo', providers)
      deepStrictEqual(result, { type: 'slug', value: 'owner/repo' })
    })

    it('parses [slug]/[serviceName] format', () => {
      const result = parseProjectId('marcqualie/denvig/hello', providers)
      deepStrictEqual(result, {
        type: 'slug',
        value: 'marcqualie/denvig',
        serviceName: 'hello',
      })
    })

    it('handles single part as an unprefixed slug', () => {
      const result = parseProjectId('myproject', providers)
      deepStrictEqual(result, { type: 'slug', value: 'myproject' })
    })
  })

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = parseProjectId('', providers)
      deepStrictEqual(result, { type: 'slug', value: '' })
    })

    it('handles service names with slashes', () => {
      const result = parseProjectId('owner/repo/services/api', providers)
      deepStrictEqual(result, {
        type: 'slug',
        value: 'owner/repo',
        serviceName: 'services/api',
      })
    })

    it('handles id with empty service name', () => {
      const result = parseProjectId('id:abc123/', providers)
      deepStrictEqual(result, {
        type: 'id',
        value: 'abc123',
        serviceName: '',
      })
    })
  })
})

describe('stripSlugPrefix()', () => {
  it('strips provider and local prefixes', () => {
    deepStrictEqual(stripSlugPrefix('github:owner/repo'), 'owner/repo')
    deepStrictEqual(stripSlugPrefix('git-vps:repo'), 'repo')
    deepStrictEqual(stripSlugPrefix('local:/a/b'), '/a/b')
  })
})
