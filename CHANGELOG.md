# Denvig Changelog


## [Unreleased]

### Added

- Added support for python via uv plugin
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
