import fs from 'node:fs'

import type { DenvigProject } from '../lib/project.ts'

export type MockProjectOptions = {
  slug?: string
  name?: string
  path?: string
  config?: DenvigProject['config']
}

/**
 * Create a mock DenvigProject for testing.
 * This creates a minimal mock with stub properties.
 */
export const createMockProject = (
  options: MockProjectOptions | string = {},
): DenvigProject => {
  // Support legacy signature: createMockProject(slug, path?)
  if (typeof options === 'string') {
    options = { slug: options }
  }

  const slug = options.slug ?? 'github:owner/repo'
  const name = options.name ?? slug.split('/').pop() ?? 'test-project'
  const path = options.path ?? '/tmp/test-project'
  const config = options.config ?? {
    name,
    $sources: [],
  }

  return {
    slug,
    name,
    path,
    config,
  } as unknown as DenvigProject
}

/**
 * Create a mock DenvigProject that reads from a real directory.
 * Use this when tests need actual filesystem access (e.g., plugin tests).
 */
export const createMockProjectFromPath = (
  projectPath: string,
): DenvigProject => {
  return {
    path: projectPath,
    rootFiles: fs.readdirSync(projectPath),
    findFilesByName(fileName: string): string[] {
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
  } as DenvigProject
}
