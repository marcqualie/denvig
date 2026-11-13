# denvigd

Background daemon for [denvig](https://npmjs.com/package/denvig). It scans every project once, keeps their config,
worktrees, actions, services and dependencies in memory, and watches the filesystem so lookups stay current without
re-scanning hundreds of projects on every command.

## Install

```shell
npm install -g denvigd
```

## Running

Run it as a denvig global service (recommended). Logs are available the same way as any other service:

```shell
denvig services start global:denvigd
denvig services logs global:denvigd
```

Or run it standalone in the foreground:

```shell
denvigd
```

| Flag | Default | Description |
|------|---------|-------------|
| `--socket <path>` | `~/.denvig/denvigd.sock` | Unix socket to listen on |

To change how the global service runs, override fields in `~/.denvig/config.yml`:

```yaml
services:
  denvigd:
    command: denvigd --socket ~/.denvig/custom.sock
```

## API

The API is served as HTTP over the unix socket.

| Route | Description |
|-------|-------------|
| `GET /api/health` | Version, pid, uptime and project count |
| `GET /api/projects` | Every project, rooted at its primary checkout |
| `GET /api/projects/{id}` | A single project by id, id prefix, ref (eg. `github:owner/repo`) or path |
| `GET /api/projects/{id}/dependencies` | Dependencies of the matched checkout |

Refs and paths contain `/`, so URL-encode them (eg. `/api/projects/github%3Aowner%2Frepo`).

```shell
curl --unix-socket ~/.denvig/denvigd.sock http://denvigd/api/projects
```
