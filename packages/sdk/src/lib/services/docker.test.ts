import { equal, match, ok } from 'node:assert'
import { describe, it } from 'node:test'

import {
  buildDockerRunCommand,
  CONTAINER_PROJECT_DIR,
  DEFAULT_DOCKER_IMAGE,
} from './docker.ts'

/** A single project mount used by most cases. */
const projectMount = (host = '/Users/me/project') => [
  { host, container: CONTAINER_PROJECT_DIR },
]

describe('buildDockerRunCommand', () => {
  it('mounts the project and sets the working directory', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'denvig.abc.redis',
      image: 'redis:8.8',
      mounts: projectMount('/Users/me/project'),
      workdir: CONTAINER_PROJECT_DIR,
    })
    match(cmd, /-v "\/Users\/me\/project:\/denvig\/project"/)
    match(cmd, /-w \/denvig\/project/)
    match(cmd, /docker run --rm --init --name denvig\.abc\.redis/)
  })

  it('honours a nested working directory', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'node:22-alpine',
      mounts: projectMount(),
      workdir: `${CONTAINER_PROJECT_DIR}/.claude/worktrees/feature`,
    })
    match(cmd, /-w \/denvig\/project\/\.claude\/worktrees\/feature/)
  })

  it('omits mounts and workdir when none are given', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'redis:8.8',
      mounts: [],
    })
    ok(!cmd.includes('-v '))
    ok(!cmd.includes('-w '))
  })

  it('removes any previous container before starting', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'denvig.abc.redis',
      image: 'redis:8.8',
      mounts: projectMount(),
      workdir: CONTAINER_PROJECT_DIR,
    })
    ok(cmd.startsWith('docker rm -f denvig.abc.redis >/dev/null 2>&1; '))
  })

  it('maps the host port to the container port', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'redis:8.8',
      mounts: projectMount(),
      hostPort: 16379,
      containerPort: 6379,
    })
    match(cmd, /-p 16379:6379/)
  })

  it('defaults the container port to the host port', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'nginx',
      mounts: projectMount(),
      hostPort: 8080,
    })
    match(cmd, /-p 8080:8080/)
  })

  it('omits the port flag when no host port is given', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'alpine',
      mounts: projectMount(),
    })
    ok(!cmd.includes('-p '))
  })

  it('forwards environment variables by name in a stable order', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'alpine',
      mounts: projectMount(),
      envKeys: ['PORT', 'DENVIG_SERVICE', 'DENVIG_PROJECT'],
    })
    match(cmd, /-e DENVIG_PROJECT -e DENVIG_SERVICE -e PORT/)
  })

  it('appends a command override after the image', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'alpine',
      mounts: projectMount(),
      command: 'sh -c "echo hi"',
    })
    match(cmd, /alpine sh -c "echo hi"$/)
  })

  it('runs the image default entrypoint when no command is given', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'redis:8.8',
      mounts: projectMount(),
    })
    ok(cmd.trim().endsWith('redis:8.8'))
  })

  it('exposes default image and project mount constants', () => {
    equal(DEFAULT_DOCKER_IMAGE, 'alpine:3.23')
    equal(CONTAINER_PROJECT_DIR, '/denvig/project')
  })
})
