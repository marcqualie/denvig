import { readdir, readFile } from 'node:fs/promises'

import type { ProjectDependencySchema } from '../dependencies.ts'
import type { Worktree } from '../project/worktree.ts'

export type ActionReference = {
  /** Repository that publishes the action releases (e.g. `actions/checkout`). */
  name: string
  /** Semver range the reference resolves within (e.g. `6`, `7.0.1`). */
  specifier: string
}

const USES_PATTERN =
  /^\s*(?:-\s*)?uses:\s*(['"]?)([^\s'"#]+)\1\s*(?:#\s*(.*))?$/
const SHA_PATTERN = /^[0-9a-f]{40}$/i
const VERSION_PATTERN = /^v?(\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?)$/

/**
 * Convert a tag such as `v6`, `v6.1` or `v7.0.1` into a semver range.
 * Partial versions are X-ranges, matching how floating major tags resolve.
 */
const toSpecifier = (tag: string): string | null => {
  return tag.match(VERSION_PATTERN)?.[1] ?? null
}

/**
 * Parse a single `uses:` value into an action reference. Local actions,
 * docker images and branch refs are ignored as they have no release versions.
 * Commit SHA pins use the version from the trailing comment (`# v7.0.1`).
 */
export const parseUsesReference = (
  uses: string,
  comment?: string,
): ActionReference | null => {
  if (uses.startsWith('./') || uses.startsWith('docker://')) return null

  const at = uses.lastIndexOf('@')
  if (at <= 0) return null

  const [owner, repo] = uses.slice(0, at).split('/')
  if (!owner || !repo) return null

  const ref = uses.slice(at + 1)
  const tag = SHA_PATTERN.test(ref) ? comment?.trim().split(/\s+/)[0] : ref
  const specifier = tag ? toSpecifier(tag) : null
  if (!specifier) return null

  return { name: `${owner}/${repo}`, specifier }
}

/** Extract all versioned action references from a workflow or action file. */
export const parseWorkflow = (content: string): ActionReference[] => {
  const references: ActionReference[] = []
  for (const line of content.split('\n')) {
    const match = line.match(USES_PATTERN)
    if (!match) continue
    const reference = parseUsesReference(match[2], match[3])
    if (reference) references.push(reference)
  }
  return references
}

const isYaml = (file: string) => file.endsWith('.yml') || file.endsWith('.yaml')

const listDir = async (path: string): Promise<string[]> => {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

/**
 * Find workflow files and local composite actions relative to the project root.
 */
export const findWorkflowFiles = async (projectPath: string) => {
  const workflows = (await listDir(`${projectPath}/.github/workflows`))
    .filter(isYaml)
    .map((file) => `.github/workflows/${file}`)

  const actionDirs = await listDir(`${projectPath}/.github/actions`)
  const actions = (
    await Promise.all(
      actionDirs.map(async (dir) =>
        (
          await listDir(`${projectPath}/.github/actions/${dir}`)
        )
          .filter((file) => file === 'action.yml' || file === 'action.yaml')
          .map((file) => `.github/actions/${dir}/${file}`),
      ),
    )
  ).flat()

  return [...workflows, ...actions].sort()
}

/**
 * Parse all GitHub Actions referenced by a project's workflows. The resolved
 * version is the specifier until the outdated check resolves floating tags.
 */
export const parseGitHubActionsDependencies = async (
  project: Worktree,
): Promise<ProjectDependencySchema[]> => {
  const files = await findWorkflowFiles(project.path)
  const dependencies = new Map<string, ProjectDependencySchema>()

  for (const file of files) {
    let content: string
    try {
      content = await readFile(`${project.path}/${file}`, 'utf-8')
    } catch {
      continue
    }

    for (const reference of parseWorkflow(content)) {
      const id = `actions:${reference.name}`
      const dep = dependencies.get(id) ?? {
        id,
        name: reference.name,
        ecosystem: 'actions',
        versions: [],
      }
      const source = `${file}#dependencies`
      const exists = dep.versions.some(
        (v) => v.source === source && v.specifier === reference.specifier,
      )
      if (!exists) {
        dep.versions.push({
          resolved: reference.specifier,
          specifier: reference.specifier,
          source,
        })
      }
      dependencies.set(id, dep)
    }
  }

  return Array.from(dependencies.values())
}
