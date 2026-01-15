import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import {
  filterDependenciesBySemver,
  getSemverLevel,
  matchesSemverFilter,
} from './semver.ts'

describe('getSemverLevel()', () => {
  it('should return null for identical versions', () => {
    strictEqual(getSemverLevel('1.0.0', '1.0.0'), null)
  })

  it('should return "patch" for patch updates', () => {
    strictEqual(getSemverLevel('1.0.0', '1.0.1'), 'patch')
    strictEqual(getSemverLevel('19.2.1', '19.2.3'), 'patch')
    strictEqual(getSemverLevel('19.2.7', '19.2.8'), 'patch')
  })

  it('should return "minor" for minor updates', () => {
    strictEqual(getSemverLevel('1.0.0', '1.1.0'), 'minor')
    strictEqual(getSemverLevel('2.2.0', '2.3.11'), 'minor')
  })

  it('should return "major" for major updates', () => {
    strictEqual(getSemverLevel('1.0.0', '2.0.0'), 'major')
    strictEqual(getSemverLevel('20.19.27', '25.0.8'), 'major')
  })

  it('should return "patch" for prerelease updates', () => {
    strictEqual(getSemverLevel('1.0.0', '1.0.1-alpha.1'), 'patch')
  })

  it('should return "minor" for preminor updates', () => {
    strictEqual(getSemverLevel('1.0.0', '1.1.0-beta.0'), 'minor')
  })

  it('should return "major" for premajor updates', () => {
    strictEqual(getSemverLevel('1.0.0', '2.0.0-rc.1'), 'major')
  })

  it('should return null for invalid versions', () => {
    strictEqual(getSemverLevel('invalid', '1.0.0'), null)
    strictEqual(getSemverLevel('1.0.0', 'invalid'), null)
    strictEqual(getSemverLevel('invalid', 'invalid'), null)
  })
})

describe('matchesSemverFilter()', () => {
  describe('with "patch" filter', () => {
    it('should match patch level', () => {
      strictEqual(matchesSemverFilter('patch', 'patch'), true)
    })

    it('should not match minor level', () => {
      strictEqual(matchesSemverFilter('minor', 'patch'), false)
    })

    it('should not match major level', () => {
      strictEqual(matchesSemverFilter('major', 'patch'), false)
    })

    it('should not match null level', () => {
      strictEqual(matchesSemverFilter(null, 'patch'), false)
    })
  })

  describe('with "minor" filter', () => {
    it('should match patch level', () => {
      strictEqual(matchesSemverFilter('patch', 'minor'), true)
    })

    it('should match minor level', () => {
      strictEqual(matchesSemverFilter('minor', 'minor'), true)
    })

    it('should not match major level', () => {
      strictEqual(matchesSemverFilter('major', 'minor'), false)
    })

    it('should not match null level', () => {
      strictEqual(matchesSemverFilter(null, 'minor'), false)
    })
  })
})

describe('filterDependenciesBySemver()', () => {
  const testDeps = [
    {
      name: '@biomejs/biome',
      currentVersion: '2.2.0',
      latestVersion: '2.3.11',
    },
    {
      name: '@types/node',
      currentVersion: '20.19.27',
      latestVersion: '25.0.8',
    },
    { name: '@types/react', currentVersion: '19.2.7', latestVersion: '19.2.8' },
    { name: 'next', currentVersion: '16.0.10', latestVersion: '16.1.2' },
    { name: 'react', currentVersion: '19.2.1', latestVersion: '19.2.3' },
    { name: 'react-dom', currentVersion: '19.2.1', latestVersion: '19.2.3' },
  ]

  describe('with "patch" filter', () => {
    it('should only return dependencies with patch updates', () => {
      const result = filterDependenciesBySemver(testDeps, 'patch')
      deepStrictEqual(
        result.map((d) => d.name),
        ['@types/react', 'react', 'react-dom'],
      )
    })
  })

  describe('with "minor" filter', () => {
    it('should return dependencies with patch or minor updates', () => {
      const result = filterDependenciesBySemver(testDeps, 'minor')
      deepStrictEqual(
        result.map((d) => d.name),
        ['@biomejs/biome', '@types/react', 'next', 'react', 'react-dom'],
      )
    })
  })

  it('should preserve additional properties on filtered dependencies', () => {
    const depsWithExtra = [
      {
        name: 'react',
        currentVersion: '19.2.1',
        latestVersion: '19.2.3',
        ecosystem: 'npm',
        isDevDependency: false,
      },
    ]
    const result = filterDependenciesBySemver(depsWithExtra, 'patch')
    strictEqual(result.length, 1)
    strictEqual(result[0].ecosystem, 'npm')
    strictEqual(result[0].isDevDependency, false)
  })

  it('should return empty array when no dependencies match', () => {
    const majorOnly = [
      {
        name: '@types/node',
        currentVersion: '20.19.27',
        latestVersion: '25.0.8',
      },
    ]
    const result = filterDependenciesBySemver(majorOnly, 'patch')
    deepStrictEqual(result, [])
  })
})
