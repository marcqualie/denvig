import { COLORS } from './table.ts'

/** Runtime status values rendered across the various list/info commands. */
export type StatusIconState = 'running' | 'error' | 'stopped' | 'none'

/**
 * Render a single-width status circle for a service or project.
 *
 * All states use the same glyph width so columns stay aligned: a filled
 * circle (`●`) for active states and a hollow circle (`○`) for stopped.
 * Colour is applied via ANSI codes rather than wide emoji, which would
 * otherwise occupy two cells and misalign the running row.
 */
export const statusIcon = (status: StatusIconState): string => {
  switch (status) {
    case 'running':
      return `${COLORS.green}●${COLORS.reset}`
    case 'error':
      return `${COLORS.red}●${COLORS.reset}`
    case 'stopped':
      return `${COLORS.grey}○${COLORS.reset}`
    default:
      return ''
  }
}
