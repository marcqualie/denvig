import { createServer } from 'node:http'

/**
 * Minimal HTTP server used by the example `hello` services in .denvig.yml.
 * Responds with the service name and working directory so it's easy to tell
 * a host run apart from a container run.
 */
const port = process.env.PORT
const service = process.env.DENVIG_SERVICE ?? 'hello'

createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`Hello from ${service} at ${process.cwd()}\n`)
}).listen(port, () => {
  console.log(`${service} listening on http://localhost:${port}/ in ${process.cwd()}`)
})
