import fs from 'node:fs'
import { projectId } from '@denvig/sdk/lib/project/refs.ts'

import type { Worktree } from '@denvig/sdk/lib/project/worktree.ts'
import type { DenvigProject } from '@denvig/sdk/lib/project.ts'

export type MockProjectOptions = {
  slug?: string
  name?: string
  path?: string
  config?: Worktree['config']
}

/**
 * Create a mock DenvigProject for testing.
 *
 * The returned mock is backed by a single primary {@link Worktree} (exposed as
 * `activeWorktree`/`primaryWorktree`) and also carries `config` at the top
 * level so it satisfies `ServiceManagerProject` for service tests.
 */
export const createMockProject = (
  options: MockProjectOptions | string = {},
): DenvigProject & { config: Worktree['config'] } => {
  // Support legacy signature: createMockProject(slug, path?)
  if (typeof options === 'string') {
    options = { slug: options }
  }

  const slug = options.slug ?? 'github:owner/repo'
  const name = options.name ?? slug.split('/').pop() ?? 'test-project'
  const path = options.path ?? '/tmp/test-project'
  const id = projectId(path)
  const config = options.config ?? {
    name,
    $sources: [],
  }

  const worktree = {
    id,
    slug,
    name,
    path,
    config,
    isPrimary: true,
    branch: 'main',
    refs: [],
    rootFiles: [],
  } as unknown as Worktree

  return {
    id,
    slug,
    name,
    path,
    config,
    primaryWorktree: worktree,
    activeWorktree: worktree,
    worktrees: [worktree],
    worktree: (branch: string) => (branch === 'main' ? worktree : null),
  } as unknown as DenvigProject & { config: Worktree['config'] }
}

/**
 * Create a mock Worktree that reads from a real directory.
 * Use this when tests need actual filesystem access (e.g., plugin tests).
 */
export const createMockProjectFromPath = (projectPath: string): Worktree => {
  return {
    path: projectPath,
    rootFiles: fs.readdirSync(projectPath),
    async findFilesByName(fileName: string): Promise<string[]> {
      const results: string[] = []
      const walk = (dir: string) => {
        const files = fs.readdirSync(dir, { withFileTypes: true })
        for (const file of files) {
          if (file.isDirectory()) {
            if (file.name !== 'node_modules') {
              walk(`${dir}/${file.name}`)
            }
          } else if (file.name === fileName) {
            results.push(`${dir}/${file.name}`)
          }
        }
      }
      walk(projectPath)
      return results
    },
  } as unknown as Worktree
}
