import { equal, match, ok } from 'node:assert'
import { describe, it } from 'node:test'

import {
  buildDockerRunCommand,
  CONTAINER_PROJECT_DIR,
  DEFAULT_DOCKER_IMAGE,
} from './docker.ts'

/** A single project bind-mount spec used by most cases. */
const projectVolume = (host = '/Users/me/project') => [
  `${host}:${CONTAINER_PROJECT_DIR}`,
]

describe('buildDockerRunCommand', () => {
  it('mounts the project and sets the working directory', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'denvig.abc.redis',
      image: 'redis:8.8',
      volumes: projectVolume('/Users/me/project'),
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
      volumes: projectVolume(),
      workdir: `${CONTAINER_PROJECT_DIR}/.claude/worktrees/feature`,
    })
    match(cmd, /-w \/denvig\/project\/\.claude\/worktrees\/feature/)
  })

  it('omits mounts and workdir when none are given', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'redis:8.8',
      volumes: [],
    })
    ok(!cmd.includes('-v '))
    ok(!cmd.includes('-w '))
  })

  it('renders multiple bind-mount volumes', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'nginx:1.27',
      volumes: [
        '/h/nginx.conf:/etc/nginx/nginx.conf',
        '/h/certs:/etc/nginx/certs:ro',
      ],
    })
    match(cmd, /-v "\/h\/nginx\.conf:\/etc\/nginx\/nginx\.conf"/)
    match(cmd, /-v "\/h\/certs:\/etc\/nginx\/certs:ro"/)
  })

  it('renders extra published ports', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'nginx:1.27',
      ports: ['80:80', '443:443'],
    })
    match(cmd, /-p 80:80/)
    match(cmd, /-p 443:443/)
  })

  it('removes any previous container before starting', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'denvig.abc.redis',
      image: 'redis:8.8',
      volumes: projectVolume(),
      workdir: CONTAINER_PROJECT_DIR,
    })
    ok(cmd.startsWith('docker rm -f denvig.abc.redis >/dev/null 2>&1; '))
  })

  it('maps the host port to the container port', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'redis:8.8',
      volumes: projectVolume(),
      hostPort: 16379,
      containerPort: 6379,
    })
    match(cmd, /-p 16379:6379/)
  })

  it('defaults the container port to the host port', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'nginx',
      volumes: projectVolume(),
      hostPort: 8080,
    })
    match(cmd, /-p 8080:8080/)
  })

  it('omits the port flag when no host port is given', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'alpine',
      volumes: projectVolume(),
    })
    ok(!cmd.includes('-p '))
  })

  it('forwards environment variables by name in a stable order', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'alpine',
      volumes: projectVolume(),
      envKeys: ['PORT', 'DENVIG_SERVICE', 'DENVIG_PROJECT'],
    })
    match(cmd, /-e DENVIG_PROJECT -e DENVIG_SERVICE -e PORT/)
  })

  it('appends a command override after the image', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'alpine',
      volumes: projectVolume(),
      command: 'sh -c "echo hi"',
    })
    match(cmd, /alpine sh -c "echo hi"$/)
  })

  it('runs the image default entrypoint when no command is given', () => {
    const cmd = buildDockerRunCommand({
      containerName: 'c',
      image: 'redis:8.8',
      volumes: projectVolume(),
    })
    ok(cmd.trim().endsWith('redis:8.8'))
  })

  it('exposes default image and project mount constants', () => {
    equal(DEFAULT_DOCKER_IMAGE, 'alpine:3.23')
    equal(CONTAINER_PROJECT_DIR, '/denvig/project')
  })
})
