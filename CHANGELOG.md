# Denvig Changelog


## [Unreleased]

### Added

- Global services support: define services in `~/.denvig/config.yml` under `services:` that work from any directory
  - Target global services with the `global:` prefix (e.g., `denvig services start global:redis`)
  - Global services appear in `denvig services list` with project slug `global`
  - Tab completions include global services with `global:` prefix
  - Gateway nginx config generation includes global services
- `certs` command set for local TLS certificate management (`certs init`, `certs list`, `certs generate`, `certs import`, `certs rm`)
  - Built-in Certificate Authority generation with macOS keychain trust installation
  - Domain certificate generation with SAN and wildcard support (e.g., `*.denvig.localhost`)
  - Import existing certificates from external tools
  - `--name` flag on `certs import` to override the auto-detected directory name
- `certs ca` subcommand group for CA lifecycle management (`certs ca install`, `certs ca uninstall`, `certs ca info`)
  - `certs init` is now an alias for `certs ca install`
- Deno dependency support for jsr and npm
- Experimental nginx gateway proxy support for local domains (#TBD)
  - Automatically generates nginx configs when services have `http.domain` configured
  - Enable via `experimental.gateway.enabled: true` in `~/.denvig/config.yml`
  - SSL/TLS support with `http.secure` — certificates are automatically matched from `~/.denvig/certs/`
  - Manages the main `nginx.conf` with a default server, error pages, and service config includes
  - Custom error pages: 404 (service not found) and 504 (service not running)
  - Default landing page at unmatched domains linking to denvig.com
- `gateway configure` command to rebuild all nginx configs from service definitions across all projects (#TBD)
  - Removes all denvig-managed nginx configs from the servers directory
  - Scans all projects with `.denvig.yml` and regenerates configs for services with `http.domain` and `http.port`
  - Verifies configured certificates exist on disk before writing configs
  - Reloads nginx after reconfiguration
  - Supports `--json` for JSON output
- `gateway status` command to show gateway configuration overview (#TBD)
  - Shows enabled status, handler, and configs path
  - Lists services with their domains, port, certificate status, and nginx config status
  - `gateway` without subcommand defaults to `gateway status`
  - Supports `--json` for JSON output

### Changed

- Service logs now use timestamp-based files per run instead of a single shared log file
  - New path: `~/.denvig/services/{serviceId}/logs/{unixtimestamp}.log`
  - Each `services start` creates a new log file with a `latest.{hostname}.log` symlink
  - Prevents conflicts when syncing `.denvig` across multiple machines
- Upgrade `@biomejs/biome` from 2.3.14 to 2.4.0
- `certs list` status now distinguishes local-ca signed, untrusted, and external certs
- `certs generate` now prompts for confirmation before overwriting an existing certificate
- Refactor CLI to define subcommands on `Command` objects instead of hardcoding routing in `cli.ts`
  - Each command group now has an `index.ts` that defines its subcommands
  - `denvig services`, `denvig certs`, `denvig deps` now show subcommand help instead of running implicitly
  - Subcommand routing is generic: adding a new subcommand only requires updating the parent command's `index.ts`
  - Completions infrastructure now walks the command tree instead of using static constants

## [0.5.1] - 2026-02-05

### Fixed

- Tab completion for services now includes full slug paths for the current project (e.g., `marcqualie/denvig/hello`), allowing autocomplete without checking which directory you're in first
- ANSI color codes are now automatically stripped when output is piped (e.g., `denvig deps outdated | pbcopy`)
  - Also respects `NO_COLOR` environment variable to disable colors globally
  - Use `FORCE_COLOR=1` to enable colors even when piped

### Changed

- Removed `.strict()` from Zod config schemas for forward compatibility (#122)
  - Older Denvig versions now gracefully ignore unknown config properties added by newer versions
  - VSCode JSON Schema validation still warns about unknown properties via `additionalProperties: false`

## [v0.5.0] - 2026-01-25

### Added

- CLI usage logging: tracks command execution in JSONL format at `~/.denvig/logs/cli.jsonl` (#110)
  - Logs timestamp, command, path, duration (ms), and exit status
  - Disable with `DENVIG_CLI_LOGS_ENABLED=0` environment variable
- SDK `client` option (required) to identify the integration using the SDK (e.g., `client: 'raycast'` logs as `via: 'sdk:raycast'`) (#110)
- `--project` flag now supports all identifier formats: `id:[id]`, `github:[slug]`, `local:/path`, or unprefixed slugs (defaults to `github:`) (#109)
- Tab completion for `--project` flag: completes slugs by default, IDs when `id:` prefix is typed (#109)
- New slug format for projects: `github:owner/repo` for GitHub projects, `local:/path` for local-only projects (#102)
- Tab completion now includes services from all configured projects with their slug prefix (e.g., `marcqualie/denvig/hello`) (#102)
- Service commands now accept slugs without the `github:` prefix (e.g., `denvig services start marcqualie/denvig/hello`) (#102)
- Unique project ID based on full SHA1 hash of project path (#106)
  - Service commands support `id:[id]/[serviceName]` format for exact project matching (e.g., `denvig services start id:5444710a/hello`)
  - Enables git worktree support where the same slug may exist in multiple paths
- Environment variable configuration support: (#100)
  - `DENVIG_PROJECT_PATHS` - comma-separated list of project paths
  - `DENVIG_QUICK_ACTIONS` - comma-separated list of quick actions (empty string disables)
- `--help` and `-h` flags now work on all commands to show command-specific usage (e.g., `denvig services --help`) (#113)
- `-v` and `--version` flags at root level to show version number (#133)

### Changed

- **Breaking:** Removed `--format` global flag. Use `--json` instead for JSON output. (#101)
- **Breaking:** Replaced `codeRootDir` with `projectPaths` array supporting glob-like patterns where `*` matches a single directory level (#99)
- **Breaking:** Replaced `envFile` with `envFiles` in service configuration to support multiple env files (#98)
- **Breaking:** Plist and log file naming changed from slug-based to ID-based format (`denvig.[id].[service].plist`). Run `denvig services teardown --global` to clean up old plist files (#106)
- **Breaking:** Service names must start with a letter, contain only lowercase alphanumeric and hyphens, and not end with a hyphen. Names like (#108)
- **Breaking:** `ServiceResponse.project` changed from `string` (slug) to object `{ id, slug, name, path }` for richer SDK usage (#117)
- `envFiles` files are now resolved relative to the service's `cwd` (not project root) (#98)
- Default `envFiles` set to `.env.development,.env.local` instead of `.env` to better align with common practices (#98)
- Default `projectPaths` is `['~/src/*/*', '~/.dotfiles']` (#99)
- All project configuration fields are now optional (#111)
- `services teardown --global` now removes all `denvig.*.plist` files from LaunchAgents, not just stopped services (#103)
- Root help output now shows commands in `denvig <command>` format (similar to opencode) (#113)
- Removed quick actions and global flags sections from root help output (available via command-specific `--help`) (#113)

## [v0.4.3] - 2026-01-22

### Added

- `zsh completions` command to output zsh completion script
- `zsh __complete__` command to handle runtime completion requests
- `startOnBoot` option for services to automatically start when system boots (macOS launchd `RunAtLoad`)

### Changed

- `--format` flag is now a global flag instead of being defined on each command

### Fixed

- Fixed services restarting after reboot by removing plist file when stopping a service
- Suppressed config validation warnings to prevent polluting JSON output when using `--format=json`
- Fixed `deps` subcommands displaying with colons instead of spaces in help output (e.g., `deps:list` → `deps list`)


## [v0.4.2] - 2026-01-17

### Added

- `projects list` command to list all projects on the system with optional `--format json` and `--with-config` flags
- `services teardown` command to stop all services and remove them from launchctl (factory reset)
- `--global` flag for `services teardown` to teardown all denvig services across all projects

### Fixed

- Fixed env file parsing to strip inline comments (e.g., `KEY=VALUE # comment` now correctly parses as `VALUE`)


## [v0.4.1] - 2026-01-15

### Added

- Programmatic SDK for TypeScript projects (`import { DenvigSDK } from 'denvig'`) (#79)
- Timestamps on every line of service log output for easier debugging (#70)

### Changed

- **Breaking:** `services start`, `services stop`, `services restart` now require a service name (removed bulk operations) (#80)
- Moved `logs` command to `services logs` for consistency with other services subcommands (#78)
- Optimized `services` command performance by batching launchctl calls (O(n) to O(1)) (#74)
- Replaced custom semver parsing with `semver` npm package for more robust version comparison (#77)

### Fixed

- Fixed `--semver` filter in `deps:outdated` comparing against `wanted` instead of `latest` version


## [0.4.0] - 2026-01-13

### Added

- `deps:list` command to list project dependencies (#45)
- `deps:outdated` command to show outdated dependencies (#47)
- `--semver` flag to filter `deps:outdated` results by semver level (major, minor, patch) (#53)
- `--format` flag for `deps:list` and `deps:outdated` commands to output JSON (#61)
- NPM registry caching for `deps:outdated` command (#48)
- RubyGems dependency support via Ruby plugin (#57)
- Python/uv dependency support via uv plugin (#58)
- Multi-ecosystem support for `deps:list` and `deps:outdated` commands (#59)
- JSON schema generation from zod schema for IDE validation and autocompletion (#34)
- Support for services in `.denvig.yml` to launch alongside projects (#37)
- Services commands: `services:start`, `services:stop`, `services:restart`, `services:status` (#64)
- `--global` flag for services command to show all denvig-managed services (#55)
- `--format` flag for services commands to output JSON (#62, #65)
- `http` config block in services schema (#63)
- Human-readable plist and log filenames instead of hashes (#56)
- CI testing against multiple Node.js versions (#50)

### Changed

- Improved services and logs output (#44)
- Refactored dependency outputs for consistency (#60)
- Split out npm outdated helpers for plugin reuse (#49)
- Cleaned up config schemas (#38)
- Upgraded dependencies (#33)

### Fixed

- Fixed number and boolean property generation in JSON schema (#36)



## [0.3.0] - 2025-09-24

### Added

- Added support for python via uv plugin
- Added support for ruby/rails via ruby plugin
- Added `info` command for project summary


### Changed

- Refactored codebase to use plugins for extensibility



## [0.2.0] - 2025-08-09

### Added

- Configurable quick actions globally and per project
- Quick actions are displayed im root help
- Custom per project actions in `.denvig.yml`
- Code root path can be configured via `ENV.DENVIG_CODE_ROOT_DIR`
- Support for running commands on linux and macOS


## [0.1.2] - 2025-08-06

### Fixed

- Fix `denvig run ` now correctly proxies args and flags to the underlying action



## [0.1.1] - 2025-08-02

### Added

- List available actions
- Load global and project config from `.denvig.yml`
- Add `denvig config` command
- Detect all tasks/scripts, not just the predefined list
- Add quick actions (.e.g `denvig lint`) to speed up typing
- Add `check-types` default action for deno projects

### Changed

- Proxy scripts via packageManager vs calling directly
- Use TTY to expose colors from sub commands



## [0.1.0] - 2025-08-01

### Added

- Initial `denvig run` command prototype to run tasks from within a project
