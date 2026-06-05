# Denvig Resources

Denvig is a collection of resources, configurations, and conventions that are used to manage and organize development environments.

## Resources

### Project

A project is the highest level of organization in Denvig. It represents a collection of related worktrees, environments, and configurations. A project can be thought of as a container for all the resources and settings that pertain to a specific development effort or application.

### Worktree

A worktree is a directory that contains the source code and configurations within a project. Most projects will have a single worktree at the root which is a git checkout of main. Git worktrees are natively supported for all denvig operations so they can be used within the same project. This allows for multiple branches to be worked on simultaneously without needing to switch contexts.

### Action

Actions are commands that are run within the context of a project/worktree. They can be used to perform various tasks such as building, testing, or deploying applications. Actions are defined in the project's configuration and can be executed using the Denvig CLI or SDK. By default actions are inherited from the ecosystems such as npm, ruby, python etc but can also be manually defined in the denvig config.

### Service

Services are long-running processes that are defined in the project's configuration. They can be used to run databases, message queues, or any other type of service that is required for the development environment. Services can be started and stopped using the Denvig CLI or SDK, and they can also be configured to automatically start when the project is initialized or the system is booted.

### Certificate

Certificates are used to manage SSL/TLS certificates for development environments. They can be used to generate self-signed certificates for local development or import existing certificates for use in the development environment.
