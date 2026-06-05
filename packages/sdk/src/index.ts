/**
 * `@denvig/sdk` — the in-process logic layer behind the denvig CLI.
 *
 * This barrel is the SDK's public interface. Everything consumers (including
 * the CLI) need is exported from here, so internal module structure can be
 * refactored freely without breaking imports. Do not import from internal
 * subpaths (`@denvig/sdk/lib/...`); import from `@denvig/sdk`.
 *
 * @module
 */

export {
  countCertsExpiringWithin,
  findCertFile,
  generateCaCert,
  generateDomainCert,
  getCaCertPath,
  getCertDir,
  getCertExpiry,
  getCertIssuerCN,
  getCertsDir,
  installCaToKeychain,
  isCaInitialized,
  isCaTrustedInKeychain,
  isCertIssuedBy,
  isIssuedByLocalCa,
  loadCaCert,
  parseCertDomains,
  uninstallCaFromKeychain,
  writeCaFiles,
  writeDomainCertFiles,
} from './lib/certs.ts'
export { createCliLogTracker } from './lib/cli-logs.ts'
export { getGlobalConfig } from './lib/config.ts'
export { resolveProjectContext } from './lib/context.ts'
export {
  buildDependencyTree,
  buildReverseChain,
  isDevDependenciesSource,
} from './lib/deps/tree.ts'
export {
  DenvigError,
  DenvigOperationError,
  DenvigSDKError,
  DenvigValidationError,
} from './lib/errors.ts'
export {
  findCertForDomain,
  generateMissingCerts,
  resolveSslPaths,
} from './lib/gateway/certs.ts'
export { configureGateway } from './lib/gateway/configure.ts'
export { getNginxConfigPath, getNginxConfPath } from './lib/gateway/nginx.ts'
export { fetchJsrPackageInfo } from './lib/jsr/info.ts'
export { fetchNpmPackageInfo } from './lib/npm/info.ts'
export { prettyPath } from './lib/path.ts'
export { gitPull, isWorkingTreeDirty } from './lib/project/git.ts'
export { DenvigProject, shortProjectId } from './lib/project.ts'
export { getProjectInfo } from './lib/projectInfo.ts'
export { listProjects } from './lib/projects.ts'
export {
  constructDenvigResourceId,
  generateDenvigResourceHash,
} from './lib/resources.ts'
export { fetchRubygemInfo } from './lib/rubygems/info.ts'
export {
  isDirectory,
  pathExists,
  safeReadTextFile,
} from './lib/safeReadFile.ts'
export { getSemverLevel } from './lib/semver.ts'
export {
  getServiceCompletions,
  getServiceContext,
} from './lib/services/identifier.ts'
export { default as launchctl } from './lib/services/launchctl.ts'
export { ServiceManager } from './lib/services/manager.ts'
export { reconcileServices } from './lib/services/reconcile.ts'
export { getGatewayRoute } from './lib/services/state.ts'
export { resolveWorktree } from './lib/services/worktree.ts'
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
export { teardownGlobal, teardownProject } from './lib/teardown.ts'
export { fetchPyPIPackageInfo } from './lib/uv/info.ts'
export { getDenvigVersion } from './lib/version.ts'
export { outdatedDependencies } from './operations/deps.ts'
export { listPlugins } from './operations/plugins.ts'
export { collectServiceRows } from './operations/services.ts'
export { ProjectConfigSchema } from './schemas/config.ts'
export { DenvigSDK } from './sdk.ts'

export type { ProjectDependencySchema } from './lib/dependencies.ts'
export type { TreeNode } from './lib/formatters/tree-node.ts'
export type { Worktree } from './lib/project/worktree.ts'
export type {
  ProjectInfo,
  ServiceStatus as ProjectServiceStatus,
} from './lib/projectInfo.ts'
export type { LaunchctlListItem } from './lib/services/launchctl.ts'
export type { ServiceManagerProject } from './lib/services/manager.ts'
export type { GatewayRoute } from './lib/services/state.ts'
export type { PluginInfo } from './operations/plugins.ts'
export type { ServiceRow } from './operations/services.ts'
export type {
  DenvigSDKOptions,
  DepsListOptions,
  DepsOutdatedOptions,
  ListServicesOptions,
  ProjectsListOptions,
  ServiceOperationOptions,
} from './sdk.ts'
export type {
  Dependency,
  DependencyVersion,
  OutdatedDependency,
  ProjectResponse,
  ServiceInfo,
  ServiceProjectData,
  ServiceResponse,
  ServiceResult,
  ServiceStatus,
} from './types/responses.ts'
