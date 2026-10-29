import { readFile } from 'node:fs/promises'

import { DenvigValidationError } from '../errors.ts'
import { execCommand } from '../system/process.ts'

import type { DependabotSnapshotContext } from './dependabot.ts'

type Env = Record<string, string | undefined>

export type ResolveDependabotContextOptions = {
  /**
   * Project directory, used for git fallbacks and the repo-relative prefix.
   */
  cwd: string
  /**
   * Environment to read CI variables from. Defaults to `process.env`.
   */
  env?: Env
  /**
   * Ecosystem filter, appended to the correlator so filtered and unfiltered
   * snapshots don't replace each other.
   */
  ecosystem?: string
  /**
   * Runs a git command in `cwd` and returns trimmed stdout, or null on
   * failure. Injectable for tests.
   */
  git?: (args: string[]) => Promise<string | null>
}

const PULL_REQUEST_EVENTS = ['pull_request', 'pull_request_target']

const defaultGit =
  (cwd: string) =>
  async (args: string[]): Promise<string | null> => {
    try {
      const { stdout } = await execCommand('git', args, { cwd })
      return stdout.trim()
    } catch {
      return null
    }
  }

/**
 * For pull request events GitHub sets `GITHUB_SHA` to the synthetic merge
 * commit. Dependency review compares against the PR head, so prefer that.
 */
const readPullRequestHeadSha = async (env: Env): Promise<string | null> => {
  if (!env.GITHUB_EVENT_PATH) return null
  if (!PULL_REQUEST_EVENTS.includes(env.GITHUB_EVENT_NAME ?? '')) return null
  try {
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf-8'))
    return event?.pull_request?.head?.sha ?? null
  } catch {
    return null
  }
}

/**
 * Resolve commit, ref and job metadata for a dependency snapshot from GitHub
 * Actions or CircleCI environment variables, falling back to local git.
 */
export const resolveDependabotContext = async ({
  cwd,
  env = process.env,
  ecosystem,
  git = defaultGit(cwd),
}: ResolveDependabotContextOptions): Promise<DependabotSnapshotContext> => {
  const isGitHub = env.GITHUB_ACTIONS === 'true'
  const isCircle = env.CIRCLECI === 'true'

  let sha: string | null = null
  let ref: string | null = null
  let jobId: string | undefined
  let jobUrl: string | undefined

  if (isGitHub) {
    sha = (await readPullRequestHeadSha(env)) ?? env.GITHUB_SHA ?? null
    ref = env.GITHUB_REF ?? null
    jobId = env.GITHUB_RUN_ID
    if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
      jobUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    }
  } else if (isCircle) {
    sha = env.CIRCLE_SHA1 ?? null
    if (env.CIRCLE_TAG) ref = `refs/tags/${env.CIRCLE_TAG}`
    else if (env.CIRCLE_BRANCH) ref = `refs/heads/${env.CIRCLE_BRANCH}`
    jobId = env.CIRCLE_WORKFLOW_ID
    jobUrl = env.CIRCLE_BUILD_URL
  }

  sha ??= await git(['rev-parse', 'HEAD'])
  ref ??= await git(['symbolic-ref', '-q', 'HEAD'])
  const pathPrefix = (
    (await git(['rev-parse', '--show-prefix'])) ?? ''
  ).replace(/\/$/, '')

  if (!sha || !ref) {
    throw new DenvigValidationError(
      'Unable to determine the git commit and ref for the dependency snapshot. Run it inside a git checkout with a branch checked out.',
    )
  }

  const correlatorParts = ['denvig', 'deps']
  if (pathPrefix) correlatorParts.push(pathPrefix)
  if (ecosystem) correlatorParts.push(ecosystem)

  return {
    sha,
    ref,
    correlator: correlatorParts.join(':'),
    jobId: jobId ?? `local-${Date.now()}`,
    jobUrl,
    pathPrefix,
  }
}
