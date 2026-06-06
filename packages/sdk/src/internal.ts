/**
 * `@denvig/sdk/internal` — building blocks not yet part of the stable public SDK.
 *
 * These are functional and safe to use, but they are NOT yet part of the
 * documented `@denvig/sdk` interface (see `docs/sdk.md`), so they may change or
 * move at any time before v1. This is a temporary namespace: almost everything
 * here will graduate to a proper resource-oriented public API in a later pass.
 *
 * @module
 */

export {
  countCertsExpiringWithin,
  generateCaCert,
  getCaCertPath,
  installCaToKeychain,
  isCaInitialized,
  writeCaFiles,
} from './lib/certs.ts'
export { createCliLogTracker } from './lib/cli-logs.ts'
export { getGlobalConfig } from './lib/config.ts'
export { buildReverseChain, isDevDependenciesSource } from './lib/deps/tree.ts'
export { findCertForDomain, generateMissingCerts } from './lib/gateway/certs.ts'
export { getNginxConfigPath } from './lib/gateway/nginx.ts'
export { gitPull, isWorkingTreeDirty } from './lib/project/git.ts'
export { default as launchctl } from './lib/services/launchctl.ts'
export { ServiceManager } from './lib/services/manager.ts'
export { reconcileServices } from './lib/services/reconcile.ts'
export { getGatewayRoute } from './lib/services/state.ts'
export { brewUpdate, brewUpgrade, getBrewOutdated } from './lib/system/brew.ts'
export { runDenvig } from './lib/system/denvig.ts'
export {
  areDotfilesInstalled,
  dotfilesUrlForUsername,
  installDotfiles,
} from './lib/system/dotfiles.ts'
export {
  enableFullDiskEncryption,
  isFullDiskEncryptionEnabled,
} from './lib/system/fullDiskEncryption.ts'
export { configureGit, getGitIdentity } from './lib/system/gitConfig.ts'
export { installHomebrew, isHomebrewInstalled } from './lib/system/homebrew.ts'
export { hasSkillsCli, skillsUpdateGlobal } from './lib/system/skills.ts'
export {
  enableSudoTouchId,
  isSudoTouchIdEnabled,
} from './lib/system/sudoTouchId.ts'
export { installXcodeCli, isXcodeCliInstalled } from './lib/system/xcodeCli.ts'
export { teardownGlobal } from './lib/teardown.ts'

export type { LaunchctlListItem } from './lib/services/launchctl.ts'
export type { ServiceManagerProject } from './lib/services/manager.ts'
export type { GatewayRoute } from './lib/services/state.ts'
