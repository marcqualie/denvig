# Denvig Configuration


## Global Configuration

Global configuration can be set via YAML files or environment variables.

**Global Configuration Sources (in order of precedence, highest first):**

1. Environment variables (`DENVIG_PROJECT_PATHS`, `DENVIG_QUICK_ACTIONS`)
2. `~/.denvig/config.yml`
3. Default values

**Project Configuration** is loaded from `./.denvig.yml` in the project root.

## projectPaths

**default:** `['~/src/*/*', '~/.dotfiles']`
**env:** `DENVIG_PROJECT_PATHS` (comma-separated list, e.g., `~/src/*/*,~/.dotfiles`)

An array of paths or glob-like patterns where your projects live. Each `*` matches a single directory level (not recursive).

Development environments work best when there is a consistent location for all projects. Denvig works best on the concept of `[group]/[project]` so you can have a consistent structure for all your projects. Since most people use GitHub, this maps to `[owner]/[repo]`. You could subpath them based on hosting provider such as `~/src/github/[owner]/[repo]` or `~/src/gitlab/[owner]/[repo]` if you want to keep them separate.

**Pattern Examples:**
- `~/src/*/*` - Matches all directories two levels deep under `~/src`
- `~/.dotfiles` - Matches a single specific directory

**Project Slugs:**

Projects are identified by slugs that indicate their source:
- `github:owner/repo` - For projects with a GitHub remote (detected from git config)
- `local:/absolute/path` - For projects without a GitHub remote

**Example Configuration:**
```yaml
projectPaths:
  - ~/src/*/*
  - ~/work/*/*
  - ~/.dotfiles
```


## quickActions

**default:** build, dev, check-types, install, lint, outdated, test
**env:** `DENVIG_QUICK_ACTIONS` (comma-separated list, e.g., `build,dev,lint`; empty string disables)

A list of actions that will be available by default for all projects. See local configuration for more details.

Setting an empty string via the environment variable disables quick actions entirely:
```bash
export DENVIG_QUICK_ACTIONS=""
```



## Project Configuration

The file location for project configuration is `./.denvig.yml` in the root of your project.

### name

**required**

Unique identifier for the project.

### actions

**optional**

Actions that can be run against the project. Each action is defined with a command to execute.

**Example:**
```yaml
actions:
  build:
    command: pnpm build
  clean:
    command: rm -rf dist
  test:
    command: pnpm test
```

### quickActions

**optional**

Actions that are available on the CLI root for quick access. This overrides the global `quickActions` setting for this specific project.

**Example:**
```yaml
quickActions:
  - build
  - dev
  - test
```

### services

**optional**

Service definitions for the project. Each service can have its own configuration including command, port, domain, and environment settings.

**Service Options:**

- **command** (required): Shell command to execute
- **cwd** (optional): Working directory for the service (relative to project root)
- **port** (optional): Port number the service listens on
- **domain** (optional): Local domain for the service
- **envFiles** (optional): Array of paths to .env files (relative to service cwd). Defaults to `.env.development,.env.local`.
- **env** (optional): Environment variables as key-value pairs
- **keepAlive** (optional): Restart service if it exits

**Example:**

```yaml
services:
  api:
    command: pnpm dev
    cwd: apps/api
    port: 3000
    domain: api.local
    envFiles:
      - .env
      - .env.local
    env:
      NODE_ENV: development
    keepAlive: true
  web:
    command: pnpm dev
    cwd: apps/web
    port: 3001
    domain: web.local
```


