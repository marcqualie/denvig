import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseGemfile, parseGemfileLock } from './parse.ts'

describe('parseGemfile()', () => {
  it('parses simple gems with version specifiers', () => {
    const result = parseGemfile(`
source "https://rubygems.org"

gem "rails", "~> 8.0.1"
gem "puma", ">= 5.0"
gem "sqlite3", "= 2.1.0"
`)

    strictEqual(result.length, 3)
    deepStrictEqual(result[0], {
      name: 'rails',
      specifier: '~> 8.0.1',
      group: 'dependencies',
    })
    deepStrictEqual(result[1], {
      name: 'puma',
      specifier: '>= 5.0',
      group: 'dependencies',
    })
    deepStrictEqual(result[2], {
      name: 'sqlite3',
      specifier: '= 2.1.0',
      group: 'dependencies',
    })
  })

  it('parses gems without version specifiers as wildcard', () => {
    const result = parseGemfile(`
gem "propshaft"
gem "turbo-rails"
`)

    strictEqual(result.length, 2)
    deepStrictEqual(result[0], {
      name: 'propshaft',
      specifier: '*',
      group: 'dependencies',
    })
    deepStrictEqual(result[1], {
      name: 'turbo-rails',
      specifier: '*',
      group: 'dependencies',
    })
  })

  it('parses gems in development group as devDependencies', () => {
    const result = parseGemfile(`
gem "rails"

group :development do
  gem "web-console"
  gem "debug"
end

gem "puma"
`)

    strictEqual(result.length, 4)
    deepStrictEqual(result[0], {
      name: 'rails',
      specifier: '*',
      group: 'dependencies',
    })
    deepStrictEqual(result[1], {
      name: 'web-console',
      specifier: '*',
      group: 'devDependencies',
    })
    deepStrictEqual(result[2], {
      name: 'debug',
      specifier: '*',
      group: 'devDependencies',
    })
    deepStrictEqual(result[3], {
      name: 'puma',
      specifier: '*',
      group: 'dependencies',
    })
  })

  it('parses gems in test group as devDependencies', () => {
    const result = parseGemfile(`
group :test do
  gem "capybara"
  gem "selenium-webdriver"
end
`)

    strictEqual(result.length, 2)
    deepStrictEqual(result[0], {
      name: 'capybara',
      specifier: '*',
      group: 'devDependencies',
    })
    deepStrictEqual(result[1], {
      name: 'selenium-webdriver',
      specifier: '*',
      group: 'devDependencies',
    })
  })

  it('parses gems in combined development and test group', () => {
    const result = parseGemfile(`
group :development, :test do
  gem "rspec-rails"
  gem "factory_bot_rails"
end
`)

    strictEqual(result.length, 2)
    deepStrictEqual(result[0], {
      name: 'rspec-rails',
      specifier: '*',
      group: 'devDependencies',
    })
    deepStrictEqual(result[1], {
      name: 'factory_bot_rails',
      specifier: '*',
      group: 'devDependencies',
    })
  })

  it('ignores comments and empty lines', () => {
    const result = parseGemfile(`
# This is a comment
source "https://rubygems.org"

# Another comment
gem "rails", "~> 8.0"

# gem "commented_out"
`)

    strictEqual(result.length, 1)
    strictEqual(result[0].name, 'rails')
  })

  it('handles single-quoted gem names', () => {
    const result = parseGemfile(`
gem 'rails', '~> 8.0'
gem 'puma'
`)

    strictEqual(result.length, 2)
    strictEqual(result[0].name, 'rails')
    strictEqual(result[0].specifier, '~> 8.0')
    strictEqual(result[1].name, 'puma')
  })
})

describe('parseGemfileLock()', () => {
  it('parses specs section with versions and dependencies', () => {
    const result = parseGemfileLock(`
GEM
  remote: https://rubygems.org/
  specs:
    actioncable (8.0.1)
      actionpack (= 8.0.1)
      activesupport (= 8.0.1)
    actionpack (8.0.1)
      actionview (= 8.0.1)
      activesupport (= 8.0.1)

PLATFORMS
  arm64-darwin

DEPENDENCIES
  rails (~> 8.0.1)

BUNDLED WITH
   2.6.5
`)

    strictEqual(Object.keys(result.specs).length, 2)

    deepStrictEqual(result.specs.actioncable, {
      version: '8.0.1',
      dependencies: {
        actionpack: '= 8.0.1',
        activesupport: '= 8.0.1',
      },
    })

    deepStrictEqual(result.specs.actionpack, {
      version: '8.0.1',
      dependencies: {
        actionview: '= 8.0.1',
        activesupport: '= 8.0.1',
      },
    })
  })

  it('handles platform-specific gems by extracting base version', () => {
    const result = parseGemfileLock(`
GEM
  remote: https://rubygems.org/
  specs:
    nokogiri (1.18.3-arm64-darwin)
      racc (~> 1.4)
    nokogiri (1.18.3-x86_64-linux)
      racc (~> 1.4)
    sqlite3 (2.6.0-arm64-darwin)
    sqlite3 (2.6.0-x86_64-linux)

PLATFORMS
  arm64-darwin
  x86_64-linux

DEPENDENCIES
  nokogiri
  sqlite3

BUNDLED WITH
   2.6.5
`)

    // Should only have one entry per gem (first one wins)
    strictEqual(Object.keys(result.specs).length, 2)

    // Version should be stripped of platform suffix
    strictEqual(result.specs.nokogiri.version, '1.18.3')
    strictEqual(result.specs.sqlite3.version, '2.6.0')
  })

  it('parses DEPENDENCIES section', () => {
    const result = parseGemfileLock(`
GEM
  remote: https://rubygems.org/
  specs:
    rails (8.0.1)

PLATFORMS
  arm64-darwin

DEPENDENCIES
  bootsnap
  puma (>= 5.0)
  rails (~> 8.0.1)
  sqlite3 (>= 2.1)

BUNDLED WITH
   2.6.5
`)

    deepStrictEqual(result.dependencies, {
      bootsnap: '*',
      puma: '>= 5.0',
      rails: '~> 8.0.1',
      sqlite3: '>= 2.1',
    })
  })

  it('handles gems with no dependencies', () => {
    const result = parseGemfileLock(`
GEM
  remote: https://rubygems.org/
  specs:
    concurrent-ruby (1.3.5)
    base64 (0.2.0)

PLATFORMS
  arm64-darwin

DEPENDENCIES
  concurrent-ruby
  base64

BUNDLED WITH
   2.6.5
`)

    deepStrictEqual(result.specs['concurrent-ruby'], {
      version: '1.3.5',
      dependencies: {},
    })

    deepStrictEqual(result.specs.base64, {
      version: '0.2.0',
      dependencies: {},
    })
  })

  it('handles complex version specifiers in dependencies', () => {
    const result = parseGemfileLock(`
GEM
  remote: https://rubygems.org/
  specs:
    activesupport (8.0.1)
      concurrent-ruby (~> 1.0, >= 1.3.1)
      tzinfo (~> 2.0, >= 2.0.5)

PLATFORMS
  arm64-darwin

DEPENDENCIES
  activesupport

BUNDLED WITH
   2.6.5
`)

    deepStrictEqual(result.specs.activesupport.dependencies, {
      'concurrent-ruby': '~> 1.0, >= 1.3.1',
      tzinfo: '~> 2.0, >= 2.0.5',
    })
  })

  it('returns empty specs and dependencies for empty lockfile', () => {
    const result = parseGemfileLock('')

    deepStrictEqual(result.specs, {})
    deepStrictEqual(result.dependencies, {})
  })
})
