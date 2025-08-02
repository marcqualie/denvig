import packageJson from '../../package.json' with { type: 'json' }

/**
 * Returns the version that Denvig was compiled with.
 */
export function getDenvigVersion(): string {
  return packageJson.version
}
