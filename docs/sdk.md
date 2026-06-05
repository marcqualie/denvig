# Denvig SDK

Internals exposed for direct integration with tooling. Used natively by the offical CLI.

## Usage

### Initialization

```typescript
const denvig = new DenvigSDK({
  // options
})
```

### Projects / Worktrees

```typescript
// Lookup project by ID
const project = denvig.projects.retrieve('id:project-123')

// Lookup project by path
const project = denvig.projects.retrieve('local:/path/to/project')

// List all worktrees for a project
const worktrees = project.worktrees.list()

// Lookup worktree by name
const worktree = project.worktrees.retrieve('main')
```

### Actions

```typescript
// Lookup action by name
const action = project.actions.retrieve('build')

// Lookup an action for a specific worktree
const action = project.actions.retrieve('build', { worktree: 'refactor-auth' })

// Lookup an action within a specific ecosystem
const action = project.actions.retrieve('build', { ecosystem: 'npm' })
const action = project.actions.retrieve('npm:build')

// Run an action
await action.run()
```

### Services

```typescript
// Lookup service by name
const service = project.services.retrieve('api')

// All project queries can optionally take a worktree flag
const service = project.services.retrieve('api', { worktree: 'refactor-auth' })

// Manage service lifecycle
await service.start()
await service.status()
await service.stop()
```

### Dependencies

```typescript
// List all dependencies for a project
const dependencies = project.dependencies.list()

// Lookup dependency by name
const dependency = project.dependencies.retrieve('npm:redis')

// List outdated dependencies
const outdated = project.dependencies.outdated({
  ecosystem: 'npm',
  semver: 'patch',
  worktree: 'denvig-upgrade-patch-dependencies',
})
```

### Certificates (Global Scope)

```typescript
// List all certficiates
const certs = denvig.certificates.list()

// Lookup certificates by domain
const certs = denvig.certificates.list({ domain: 'example.com' })
```

### Configuration

```typescript
// Get global configuration
const globalConfig = denvig.config.retrieve()

// Get project configuration
const config = project.config.retrieve()
const config = denvig.config.retrieve({ project: 'id:project-123' })
```


## Types

```typescript
import type {
  DenvigAction,
  DenvigCertificate,
  DenvigConfig,
  DenvigDependency,
  DenvigProject,
  DenvigService,
  DenvigWorktree,
} from '@denvig/sdk'
```
