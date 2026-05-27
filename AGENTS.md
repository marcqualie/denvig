# Denvig

Denvig is a CLI tool with a concept of simplifying development environments across multiple languages and frameworks by creating a small set of consistent wrappers to avoid muscle memory and configuration headaches.

## Project structure

```
cli.ts                 # Main entry oint for the CLI
src/
├── commands/          # Command implementations
├── lib/               # Core libraries and utilities
|── schemas/           # zod schemas for validation
```

## Tech Stack

- **TypeScript**: For type safety and modern JavaScript features
- **Zod 4**: For schema validation
- **pnpm**: For package management

## Development Guidelines

- Aim for code that is pure and easy to read. Only abstract when the makes sense to be isolated.
- Avoid usage of `class` unless absolutely necessary. Prefer composition and functions.
- Always use `type` over `interface` unless you need declaration merging.
- After making big changes run `pnpm run test` to ensure all tests pass.
- Run `bin/denvig-dev version` and verify it works to ensure your changes have not broken the CLI.
- Update the `[Unreleased]` section of CHANGELOG.md before committing changes to git. Create this section if it's missing.
  - Entries are a quick TL;DR for humans skimming the changelog — keep them to one short sentence each.
  - Describe user-visible behaviour only. Do not mention file paths, function names, internal helpers, refactors, or implementation details.
  - No multi-clause sentences explaining the "how". If you feel the urge to write "Backed by…", "via a new…", or "(eg. …)" with deep specifics, cut it.
  - A short parenthetical example of user-facing output or a flag value is fine; anything longer belongs in the PR description, not the changelog.
- Never amend git commits, always create new ones to avoid force pushing.
- Never delete the log files in the `~/.denvig/logs` directory as they are live logs from general use.
- Always run `pnpm run codegen` before committing to ensure generated files are up to date.
- Always run `pnpm run lint` before committing to ensure code style is consistent and there are no linting errors.
- Run `pnpm run build` when your task is to complete to install to the system and verify it works as expected.
- All dates must be in YYYY-MM-DD format or ISO 8601 format if time is included.

## Code Style

- Use JSDoc comments (`/** ... */`) for documentation, not decorative comment blocks.
- Do not use `// ===` or similar ASCII art section dividers.
- Keep comments minimal and meaningful - code should be self-documenting where possible.

## Testing

- Run full test suite with `pnpm run test`.
- Test a specific file with `pnpm exec node --test [path to file]`.
