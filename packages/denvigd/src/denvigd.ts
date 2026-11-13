#!/usr/bin/env node

import packageJson from '../package.json' with { type: 'json' }
import { parseDaemonArgs, USAGE } from './args.ts'
import { createDaemon } from './daemon.ts'
import { serveSocket } from './server.ts'

const main = async () => {
  let args: ReturnType<typeof parseDaemonArgs>
  try {
    args = parseDaemonArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(`\n${USAGE}`)
    process.exit(2)
  }

  if (args.help) {
    console.log(USAGE)
    return
  }
  if (args.version) {
    console.log(packageJson.version)
    return
  }

  console.log(`denvigd v${packageJson.version} starting (pid ${process.pid})`)
  const daemon = createDaemon()

  // Listen only once the first scan is done, so a present socket always means
  // complete data. Until then clients fall back to reading the filesystem.
  await daemon.start()

  const close = await serveSocket(daemon, args.socketPath)
  console.log(`listening on ${args.socketPath}`)

  const shutdown = async (signal: string) => {
    console.log(`received ${signal}, shutting down`)
    daemon.stop()
    await close()
    process.exit(0)
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
