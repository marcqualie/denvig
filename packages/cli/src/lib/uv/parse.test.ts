import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parsePyProject, parseUvLock } from './parse.ts'

describe('parsePyProject()', () => {
  it('parses simple dependencies with version specifiers', () => {
    const result = parsePyProject(`
[project]
name = "myproject"
version = "0.1.0"
dependencies = [
    "fastapi>=0.119.0",
    "numpy==2.2.6",
    "torch~=2.8.0",
]
`)

    strictEqual(result.length, 3)
    deepStrictEqual(result[0], {
      name: 'fastapi',
      specifier: '>=0.119.0',
      group: 'dependencies',
    })
    deepStrictEqual(result[1], {
      name: 'numpy',
      specifier: '==2.2.6',
      group: 'dependencies',
    })
    deepStrictEqual(result[2], {
      name: 'torch',
      specifier: '~=2.8.0',
      group: 'dependencies',
    })
  })

  it('parses dependencies without version specifiers as wildcard', () => {
    const result = parsePyProject(`
[project]
name = "myproject"
dependencies = [
    "requests",
    "pydantic",
]
`)

    strictEqual(result.length, 2)
    deepStrictEqual(result[0], {
      name: 'requests',
      specifier: '*',
      group: 'dependencies',
    })
    deepStrictEqual(result[1], {
      name: 'pydantic',
      specifier: '*',
      group: 'dependencies',
    })
  })

  it('parses dev dependencies from tool.uv.dev-dependencies', () => {
    const result = parsePyProject(`
[project]
name = "myproject"
dependencies = [
    "fastapi>=0.119.0",
]

[tool.uv]
dev-dependencies = [
    "pytest>=7.0",
    "ruff",
]
`)

    strictEqual(result.length, 3)
    deepStrictEqual(result[0], {
      name: 'fastapi',
      specifier: '>=0.119.0',
      group: 'dependencies',
    })
    deepStrictEqual(result[1], {
      name: 'pytest',
      specifier: '>=7.0',
      group: 'devDependencies',
    })
    deepStrictEqual(result[2], {
      name: 'ruff',
      specifier: '*',
      group: 'devDependencies',
    })
  })

  it('parses optional dependencies as devDependencies', () => {
    const result = parsePyProject(`
[project]
name = "myproject"
dependencies = ["fastapi"]

[project.optional-dependencies]
dev = ["pytest", "ruff"]
test = ["coverage>=7.0"]
`)

    strictEqual(result.length, 4)
    strictEqual(result[0].name, 'fastapi')
    strictEqual(result[0].group, 'dependencies')

    // Optional dependencies are treated as devDependencies
    strictEqual(result[1].name, 'pytest')
    strictEqual(result[1].group, 'devDependencies')
    strictEqual(result[2].name, 'ruff')
    strictEqual(result[2].group, 'devDependencies')
    strictEqual(result[3].name, 'coverage')
    strictEqual(result[3].group, 'devDependencies')
  })

  it('handles dependencies with extras', () => {
    const result = parsePyProject(`
[project]
name = "myproject"
dependencies = [
    "fastapi[all]>=0.119.0",
    "httpx[http2]",
]
`)

    strictEqual(result.length, 2)
    deepStrictEqual(result[0], {
      name: 'fastapi',
      specifier: '>=0.119.0',
      group: 'dependencies',
    })
    deepStrictEqual(result[1], {
      name: 'httpx',
      specifier: '*',
      group: 'dependencies',
    })
  })

  it('returns empty array for invalid TOML', () => {
    const result = parsePyProject('invalid { toml content')
    strictEqual(result.length, 0)
  })

  it('returns empty array for missing project section', () => {
    const result = parsePyProject(`
[tool.other]
something = "value"
`)
    strictEqual(result.length, 0)
  })
})

describe('parseUvLock()', () => {
  it('parses packages with versions and dependencies', () => {
    const result = parseUvLock(`
version = 1
requires-python = ">=3.12"

[[package]]
name = "fastapi"
version = "0.119.0"
source = { registry = "https://pypi.org/simple" }
dependencies = [
    { name = "pydantic" },
    { name = "starlette" },
]

[[package]]
name = "pydantic"
version = "2.12.2"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "starlette"
version = "0.48.0"
source = { registry = "https://pypi.org/simple" }
`)

    strictEqual(Object.keys(result.packages).length, 3)

    deepStrictEqual(result.packages.fastapi, {
      name: 'fastapi',
      version: '0.119.0',
      dependencies: ['pydantic', 'starlette'],
    })

    deepStrictEqual(result.packages.pydantic, {
      name: 'pydantic',
      version: '2.12.2',
      dependencies: [],
    })

    deepStrictEqual(result.packages.starlette, {
      name: 'starlette',
      version: '0.48.0',
      dependencies: [],
    })
  })

  it('detects the project package from virtual source', () => {
    const result = parseUvLock(`
version = 1

[[package]]
name = "my-project"
version = "0.1.0"
source = { virtual = "." }
dependencies = [
    { name = "fastapi" },
]

[[package]]
name = "fastapi"
version = "0.119.0"
source = { registry = "https://pypi.org/simple" }
`)

    strictEqual(result.projectName, 'my-project')
    strictEqual(Object.keys(result.packages).length, 2)
  })

  it('normalizes package names with underscores to hyphens', () => {
    const result = parseUvLock(`
version = 1

[[package]]
name = "llama_cpp_python"
version = "0.3.16"
source = { registry = "https://pypi.org/simple" }
`)

    // Package should be accessible with normalized name
    strictEqual(result.packages['llama-cpp-python'].version, '0.3.16')
    // But original name should be preserved
    strictEqual(result.packages['llama-cpp-python'].name, 'llama_cpp_python')
  })

  it('returns empty packages for empty lockfile', () => {
    const result = parseUvLock('')

    deepStrictEqual(result.packages, {})
    strictEqual(result.projectName, null)
  })

  it('returns empty packages for invalid TOML', () => {
    const result = parseUvLock('invalid { toml content')

    deepStrictEqual(result.packages, {})
    strictEqual(result.projectName, null)
  })
})
