# Denvig - Developer Environment Invigorator

[![npm version](https://img.shields.io/npm/v/denvig?color=yellow)](https://npmjs.com/package/denvig)
[![install size](https://packagephobia.com/badge?p=denvig)](https://packagephobia.com/result?p=denvig)

Denvig is a concept of simplifying development environments across multiple languages and frameworks by creating a small
set of consistent wrappers to avoid muscle memory and configuration headaches.



## Installation


### NPM

You can install the CLI tool globally using npm:

```shell
npm install -g denvig
```

After installation, the `denvig` command will be available in your terminal.



## Commands


### Actions

Executes an action inside the project. Defaults are detected for common languages/frameworks, but you can also
specify your own actions in the `.denvig.yml` file.

```shell
denvig run build
denvig run install
denvig run test
denvig run dev
```

Some actions are common to many frameworks so they have quick access for convenience:

```shell
denvig build
denvig test
denvig install
denvig lint
denvig outdated
```


### Dependencies

Inspect and manage project dependencies across multiple ecosystems (npm, pnpm, yarn, Ruby/Bundler, Python/uv):

```shell
denvig deps                          # List all dependencies
denvig deps list                     # List all dependencies (explicit)
denvig deps outdated                 # Show outdated dependencies
denvig deps outdated --semver patch  # Filter by semver level
denvig deps --format json            # Output as JSON
```


### Services

Manage background services defined in `.denvig.yml`. Services run via launchctl on macOS:

```shell
denvig services               # List all services and their status
denvig services start api     # Start a service
denvig services stop api      # Stop a service
denvig services restart api   # Restart a service
denvig services status api    # Check status of a service
denvig services logs api      # View service logs
```

Manage services from other projects using the full path:

```shell
denvig services start marcqualie/denvig/dev    # Start 'dev' service in marcqualie/denvig project
denvig services status marcqualie/denvig/hello # Check status of 'hello' in marcqualie/denvig project
```

See [docs/configuration.md](docs/configuration.md) for service configuration options.

All services commands accept `--format json` for programmatic output.



## Languages / Frameworks

There is a set of core languages and frameworks that Denvig will support out of the box. Any language or framework
can be supported by using the per project configs.

- [x] Node.js (npm, pnpm, yarn)
- [ ] Bun
- [ ] Vite
- [ ] Deno
- [x] Ruby (rubygems)
- [x] Python (uv)



## Goals

- [x] CLI tool to simplify environment setup
- [x] YAML configuration at ~/.denvig.yml
- [x] Per project configuration via ./.denvig.yml
- [x] Consistent API for all languages/frameworks
- [x] Dependency management across multiple ecosystems
- [x] Background service management



## Troubleshooting

For troubleshooting guides including service management, resource identification, and log browsing, see [docs/troubleshooting.md](docs/troubleshooting.md).



## SDK

Denvig can be used programmatically in TypeScript projects:

```ts
import { DenvigSDK } from 'denvig'

const denvig = new DenvigSDK()

// Services
const services = await denvig.services.list()
await denvig.services.start('api')
await denvig.services.stop('api')

// Dependencies
const deps = await denvig.deps.list()
const outdated = await denvig.deps.outdated({ semver: 'minor' })

// Execute in context of another project
await denvig.deps.outdated({ project: 'marcqualie/denvig' })
```

All response types are exported for TypeScript consumers:

```ts
import type { ServiceResponse, Dependency, OutdatedDependency } from 'denvig'
```



## Building from source

You can build from source instead of using the provided methods above:

```shell
pnpm install
pnpm build
```

After building, the CLI will be available at `dist/cli.cjs`. You can link it globally:

```shell
npm link
```
