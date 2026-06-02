/**
 * Base error for all denvig SDK failures.
 */
export class DenvigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DenvigError'
  }
}

/**
 * Thrown when an operation receives invalid input (bad flags/options).
 * The CLI maps these to a usage error.
 */
export class DenvigValidationError extends DenvigError {
  constructor(message: string) {
    super(message)
    this.name = 'DenvigValidationError'
  }
}

/**
 * Thrown when an operation fails at runtime (e.g. a service refuses to start).
 */
export class DenvigOperationError extends DenvigError {
  /** Optional machine-readable details (service name, project slug, …). */
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'DenvigOperationError'
    this.details = details
  }
}

/**
 * Public error surface for SDK consumers. The SDK wraps any underlying failure
 * in this type so callers have a single error to catch.
 *
 * The `stderr`/`stdout` fields are retained for backwards compatibility with
 * the previous shell-based SDK and are now generally `undefined`.
 */
export class DenvigSDKError extends Error {
  readonly originalMessage?: string
  readonly stderr?: string
  readonly stdout?: string

  constructor(
    message: string,
    originalMessage?: string,
    stderr?: string,
    stdout?: string,
  ) {
    super(message)
    this.name = 'DenvigSDKError'
    this.originalMessage = originalMessage
    this.stderr = stderr
    this.stdout = stdout
  }
}
