import { COLORS } from './table.ts'

import type { PortBinding, PortScope, SystemPort } from '@denvig/sdk'

/**
 * Render a port scope, highlighting anything reachable beyond this machine.
 */
export const formatScope = (scope: PortScope): string => {
  const color = scope === 'loopback' ? COLORS.green : COLORS.yellow
  return `${color}${scope}${COLORS.reset}`
}

/**
 * Render a bound address, spelling out wildcard binds per address family so
 * IPv4-only and IPv6-only listeners can be told apart.
 */
export const formatAddress = (binding: PortBinding): string => {
  if (binding.address === '*') {
    return binding.family === 'IPv6' ? '[::]' : '0.0.0.0'
  }
  return binding.family === 'IPv6' ? `[${binding.address}]` : binding.address
}

/**
 * Render a binding with its interface name when known.
 */
export const formatBinding = (binding: PortBinding): string => {
  const address = formatAddress(binding)
  return binding.interface ? `${address} (${binding.interface})` : address
}

/**
 * Render the denvig service column for a port: the owner, plus any services
 * configured for the port that it conflicts with.
 */
export const formatPortService = (port: SystemPort): string => {
  const parts: string[] = []
  if (port.service) {
    parts.push(
      port.service.via === 'config'
        ? `${port.service.identifier} ${COLORS.grey}(config)${COLORS.reset}`
        : port.service.identifier,
    )
  }
  for (const conflict of port.conflicts) {
    parts.push(
      `${COLORS.red}conflict: ${conflict.identifier}${COLORS.reset}${conflict.status === 'stopped' ? ` ${COLORS.grey}(stopped)${COLORS.reset}` : ''}`,
    )
  }
  return parts.length > 0 ? parts.join(', ') : '-'
}

/**
 * Render the owning process as `name (pid)`.
 */
export const formatPortProcess = (port: SystemPort): string => {
  if (!port.process) return `${COLORS.grey}unknown${COLORS.reset}`
  return `${port.process.name} ${COLORS.grey}(${port.process.pid})${COLORS.reset}`
}
