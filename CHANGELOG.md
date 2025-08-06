# Denvig Changelog



## [0.1.2] - 2025-08-06

### Fixed

- Fix `denvig run ` now correctly proxies args and flags to the underlying action



## [0.1.1] - 2025-08-02

### Added

- List available actions
- Load global and project config from `.denvig.yml`
- Add `denvig config` command
- Detect all tasks/scripts, not just the predefined list
- Add root aliases (.e.g `denvig lint`) to speed up typing
- Add `check-types` default action for deno projects

### Changed

- Proxy scripts via packageManager vs calling directly
- Use TTY to expose colors from sub commands



## [0.1.0] - 2025-08-01

### Added

- Initial `denvig run` command prototype to run tasks from within a project
