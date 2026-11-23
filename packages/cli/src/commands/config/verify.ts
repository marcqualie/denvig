import { basename, dirname, resolve } from 'node:path'
import { ProjectConfigSchema } from '@denvig/sdk'
import { safeReadTextFile } from '@denvig/sdk/fs'
import {
  mergeConfig,
  PROJECT_CONFIG_FILENAME,
  PROJECT_LOCAL_CONFIG_FILENAME,
} from '@denvig/sdk/internal'
import { parse } from 'yaml'

import { Command } from '../../lib/command.ts'

type ConfigIssue = {
  path: string
  message: string
}

type ConfigReport = {
  valid: boolean
  path: string
  error?: string
  errors?: ConfigIssue[]
}

type ParsedConfigFile =
  | { found: false }
  | { found: true; error: string }
  | { found: true; data: unknown }

/**
 * Read and parse a YAML config file without validating it.
 */
const readConfigFile = async (path: string): Promise<ParsedConfigFile> => {
  const raw = await safeReadTextFile(path)
  if (!raw) return { found: false }
  try {
    return { found: true, data: parse(raw) }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return { found: true, error: `Invalid YAML syntax: ${message}` }
  }
}

/**
 * Validate config data against the project schema.
 */
const validate = (path: string, data: unknown): ConfigReport => {
  const result = ProjectConfigSchema.safeParse(data)
  if (result.success) return { valid: true, path }
  return {
    valid: false,
    path,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
      message: issue.message,
    })),
  }
}

/**
 * Validate a local config by merging it on top of the base config, the same
 * way it is applied when the project config is loaded.
 */
const validateLocal = (
  path: string,
  file: ParsedConfigFile,
  base: unknown,
): ConfigReport => {
  if (!file.found)
    return { valid: false, path, error: 'Config file not found.' }
  if ('error' in file) return { valid: false, path, error: file.error }
  const data = file.data
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      path,
      error: 'Local config must be a YAML mapping of config keys.',
    }
  }
  return validate(path, mergeConfig(base ?? {}, data))
}

/**
 * Print a human readable report for a single config file.
 */
const printReport = (report: ConfigReport, label: string): void => {
  if (report.valid) {
    console.log(`${label} is valid: ${report.path}`)
    return
  }
  if (report.error) {
    console.error(`${label} is invalid: ${report.path}`)
    console.error(`  ${report.error}`)
    return
  }
  console.error(`${label} validation failed for ${report.path}:`)
  for (const issue of report.errors ?? []) {
    console.error(`  - ${issue.path}: ${issue.message}`)
  }
}

export const configVerifyCommand = new Command({
  name: 'config:verify',
  description:
    'Verify a .denvig.yml file, and any .denvig.local.yml next to it, against the config schema.',
  usage: 'config verify [path]',
  example: 'config verify .denvig.yml',
  args: [
    {
      name: 'path',
      description: 'Path to the config file (defaults to .denvig.yml)',
      required: false,
      type: 'string' as const,
      defaultValue: PROJECT_CONFIG_FILENAME,
    },
  ],
  flags: [],
  handler: async ({ worktree, args, flags }) => {
    const configPath = resolve(
      worktree.path,
      args.path?.toString() || PROJECT_CONFIG_FILENAME,
    )
    const isLocalPath = basename(configPath) === PROJECT_LOCAL_CONFIG_FILENAME
    const basePath = isLocalPath
      ? resolve(dirname(configPath), PROJECT_CONFIG_FILENAME)
      : configPath
    const localPath =
      isLocalPath || basename(configPath) === PROJECT_CONFIG_FILENAME
        ? resolve(dirname(configPath), PROJECT_LOCAL_CONFIG_FILENAME)
        : null

    const baseFile = await readConfigFile(basePath)
    const localFile = localPath ? await readConfigFile(localPath) : null

    let baseReport: ConfigReport | null = null
    if (baseFile.found) {
      baseReport =
        'error' in baseFile
          ? { valid: false, path: basePath, error: baseFile.error }
          : validate(basePath, baseFile.data)
    }

    let localReport: ConfigReport | null = null
    if (localPath && localFile && (localFile.found || isLocalPath)) {
      // The local config is only merged onto a valid base config, matching
      // how project config is loaded.
      const base =
        baseReport?.valid && 'data' in baseFile ? baseFile.data : undefined
      localReport = validateLocal(localPath, localFile, base)
    }

    const primary = isLocalPath ? localReport : baseReport
    if (!primary) {
      if (flags.json) {
        console.log(
          JSON.stringify({
            valid: false,
            path: configPath,
            error: 'Config file not found.',
          }),
        )
      } else {
        console.error(`Config file not found: ${configPath}`)
      }
      return { success: false, message: 'Config file not found.' }
    }

    const secondary = isLocalPath ? null : localReport
    const valid = primary.valid && (secondary?.valid ?? true)

    if (flags.json) {
      console.log(
        JSON.stringify({
          ...primary,
          ...(secondary ? { valid, local: secondary } : {}),
        }),
      )
    } else {
      printReport(primary, isLocalPath ? 'Local config' : 'Config')
      if (secondary) printReport(secondary, 'Local config')
    }

    return valid
      ? { success: true, message: 'Config is valid.' }
      : { success: false, message: 'Config validation failed.' }
  },
})
