# Denvig Changelog


## [Unreleased]

### Added

- Timestamps on every line of service log output for easier debugging

### Changed

- Optimized `services` command performance by batching launchctl calls (O(n) to O(1))

### Fixed

- Fixed `--semver` filter in `deps:outdated` comparing against `wanted` instead of `latest` version
- Replaced custom semver parsing with `semver` npm package for more robust version comparison


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
