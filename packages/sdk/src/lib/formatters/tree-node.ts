/**
 * A node in a tree structure for rendering. The shape is produced by logic in
 * the SDK (e.g. dependency chains) and consumed by the CLI's tree renderer.
 */
export type TreeNode = {
  name: string
  version: string
  children: TreeNode[]
  /** Optional ANSI color applied to the entire `name version` body. */
  color?: string
  /** Optional preformatted suffix appended after the version. */
  suffix?: string
}
