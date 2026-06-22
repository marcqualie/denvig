/**
 * Default image used when a docker-runtime service does not specify one.
 */
export const DEFAULT_DOCKER_IMAGE = 'alpine:3.23'

/** Container path the whole project (the primary checkout) is mounted at. */
export const CONTAINER_PROJECT_DIR = '/denvig/project'

/** A single host→container bind mount. */
export type DockerMount = {
  host: string
  container: string
}

export type DockerRunOptions = {
  /** Container name, used so restarts can replace the previous container. */
  containerName: string
  /** Image to run. */
  image: string
  /** Bind mounts (host directory → container path). */
  mounts: DockerMount[]
  /** Working directory inside the container. Omit to use the image default. */
  workdir?: string
  /** Host port to expose. Omit when the service has no http port. */
  hostPort?: number
  /** Container port the host port maps to. Defaults to the host port. */
  containerPort?: number
  /**
   * Names of environment variables to forward into the container. The values
   * come from the surrounding process environment (set via the launchd plist),
   * so no escaping of values is needed here.
   */
  envKeys?: string[]
  /** Command/args run inside the container, overriding the image default. */
  command?: string
}

/**
 * Build a shell command that runs a service inside a docker container in the
 * foreground, so launchd tracks the `docker run` process exactly like a host
 * service. The project is bind-mounted at `/denvig/project` (so tools like git
 * have access to the full checkout) and the working directory is set to the
 * service's location inside it. Any previous container with the same name is
 * removed first so a restart doesn't collide on the name.
 */
export function buildDockerRunCommand(options: DockerRunOptions): string {
  // `--init` runs a tiny init (tini) as PID 1 to forward signals and reap
  // children, so the container shuts down cleanly on stop even when the image's
  // entrypoint doesn't handle SIGTERM itself (e.g. a bare node process).
  const args = [
    'docker',
    'run',
    '--rm',
    '--init',
    '--name',
    options.containerName,
  ]

  for (const mount of options.mounts) {
    args.push('-v', `"${mount.host}:${mount.container}"`)
  }
  if (options.workdir) {
    args.push('-w', options.workdir)
  }

  if (options.hostPort !== undefined) {
    const containerPort = options.containerPort ?? options.hostPort
    args.push('-p', `${options.hostPort}:${containerPort}`)
  }

  // Forward env vars by name (value comes from the plist environment). Sorted
  // so the rendered command is stable across runs and doesn't churn the plist.
  for (const key of [...(options.envKeys ?? [])].sort()) {
    args.push('-e', key)
  }

  args.push(options.image)

  const run = options.command?.trim()
    ? `${args.join(' ')} ${options.command.trim()}`
    : args.join(' ')

  // Clear any lingering container from a previous run before starting.
  return `docker rm -f ${options.containerName} >/dev/null 2>&1; ${run}`
}
