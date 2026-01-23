# Denvig Configuration


## Global Configuration

The file location for global configuration is `~/.denvig/config.yml`.

## codeRootDir

**default:** `~/src`

The root directory where your code lives. Development environment work best when there is a consistent location
for all projects. Denvig works on the concept of `[group]/[project]` so you can have a consistent structure
for all your projects. Since most people use GitHub, this maps to `[owner]/[repo]`.


## quickActions

**default:** build, dev, check-types, install, lint, outdated, test

A list of actions that will be available by default for all projects. See local configuration for more details.



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
- **envFiles** (optional): Array of paths to .env files (relative to service cwd). Later files override earlier ones.
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


