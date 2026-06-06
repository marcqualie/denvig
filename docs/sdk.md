# Denvig SDK

Internals exposed for direct integration with tooling. Used natively by the offical CLI.

## Usage

### Initialization

```typescript
import { DenvigSDK } from '@denvig/sdk'
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

// Build the dependency tree (direct deps by default; pass depth to expand)
const tree = project.dependencies.tree({ depth: 1, ecosystem: 'npm' })

// Lookup dependency by name
const dependency = project.dependencies.retrieve('npm:redis')

// Look up registry info for a dependency by ecosystem and name
const info = project.dependencies.info('rubygems:rails')

// List outdated dependencies
const outdated = project.dependencies.outdated({
  ecosystem: 'npm',
  semver: 'patch',
  worktree: 'denvig-upgrade-patch-dependencies',
})
```

### Certificates (Global Scope)

```typescript
// List all certificates
const certs = denvig.certs.list()

// Lookup certificates by domain
const certs = denvig.certs.list({ domain: 'example.com' })

// Look up a single certificate by domain or directory name
const cert = denvig.certs.retrieve({ domain: 'hello.denvig.me' })

// Issue a certificate for a domain (signed by the local CA)
const created = denvig.certs.create({ domain: 'hello.denvig.me' })

// Remove a certificate by domain or directory name
await denvig.certs.remove({ domain: 'hello.denvig.me' })

// Import an existing key/certificate pair
const imported = denvig.certs.import({
  keyPath: './privkey.pem',
  certPath: './fullchain.pem',
})
```

#### Certificate Authority

The local CA signs certificates issued by `certs.create`. Check it is configured
before issuing certificates.

```typescript
// Check whether the local CA is configured and trusted
const ca = await denvig.certs.ca.status()
if (!ca.initialized) {
  // Generate the CA and install it into the system keychain
  await denvig.certs.ca.configure()
}

// Remove the local CA from the system keychain
await denvig.certs.ca.remove()
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
