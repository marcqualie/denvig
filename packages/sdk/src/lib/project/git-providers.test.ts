import assert from 'node:assert'
import { describe, it } from 'node:test'

import { normaliseGitRemote } from './git.ts'
import { matchGitProvider, resolveGitProviders } from './git-providers.ts'

const providers = resolveGitProviders({
  'gitea-mqn': {
    type: 'gitea',
    url: 'https://gitea.example.com/{{owner}}/{{repo}}',
    name: 'Gitea',
  },
  gitlab: {
    type: 'gitlab',
    url: 'https://gitlab.com/{{owner}}/{{repo}}',
    name: 'GitLab',
  },
  'git-vps': {
    type: 'git',
    url: 'https://vps.example.com/{{repo}}',
    name: 'Git VPS',
  },
})

const provider = (key: string) => {
  const found = providers.find((p) => p.key === key)
  assert.ok(found, `missing provider ${key}`)
  return found
}

const match = (key: string, remote: string) =>
  matchGitProvider(provider(key), normaliseGitRemote(remote))

describe('resolveGitProviders()', () => {
  it('always includes the default github provider first', () => {
    assert.deepStrictEqual(
      providers.map((p) => p.key),
      ['github', 'gitea-mqn', 'gitlab', 'git-vps'],
    )
  })

  it('lets config override the github provider', () => {
    const [github] = resolveGitProviders({
      github: {
        type: 'github',
        url: 'https://github.example.com/{{owner}}/{{repo}}',
        name: 'GitHub Enterprise',
      },
    })
    assert.strictEqual(github.name, 'GitHub Enterprise')
  })
})

describe('matchGitProvider()', () => {
  it('matches github ssh and https remotes', () => {
    for (const remote of [
      'git@github.com:marcqualie/denvig.git',
      'https://github.com/marcqualie/denvig',
    ]) {
      assert.deepStrictEqual(match('github', remote), {
        key: 'github',
        type: 'github',
        name: 'GitHub',
        owner: 'marcqualie',
        repo: 'denvig',
        slug: 'github:marcqualie/denvig',
        url: 'https://github.com/marcqualie/denvig',
      })
    }
  })

  it('matches self hosted remotes on a custom ssh port', () => {
    const result = match(
      'gitea-mqn',
      'ssh://git@gitea.example.com:2222/marc/denvig.git',
    )
    assert.strictEqual(result?.slug, 'gitea-mqn:marc/denvig')
    assert.strictEqual(result?.url, 'https://gitea.example.com/marc/denvig')
  })

  it('keeps nested gitlab groups in the owner', () => {
    const result = match('gitlab', 'git@gitlab.com:group/subgroup/repo.git')
    assert.strictEqual(result?.owner, 'group/subgroup')
    assert.strictEqual(result?.slug, 'gitlab:group/subgroup/repo')
  })

  it('matches repo-only templates', () => {
    const result = match('git-vps', 'git@vps.example.com:dotfiles.git')
    assert.strictEqual(result?.owner, null)
    assert.strictEqual(result?.slug, 'git-vps:dotfiles')
    assert.strictEqual(result?.url, 'https://vps.example.com/dotfiles')
  })

  it('does not match other hosts or extra path segments', () => {
    assert.strictEqual(match('github', 'git@gitlab.com:owner/repo.git'), null)
    assert.strictEqual(
      match('git-vps', 'git@vps.example.com:owner/repo.git'),
      null,
    )
  })
})
