import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

/** Directory where gateway HTML files are written at runtime. */
export function getGatewayHtmlDir(): string {
  return resolve(homedir(), '.denvig', 'gateway', 'html')
}

/**
 * Write the gateway HTML files (index, error pages) to ~/.denvig/gateway/html/.
 * Reads from the source HTML files bundled alongside this module.
 */
export async function writeGatewayHtmlFiles(): Promise<void> {
  const htmlDir = getGatewayHtmlDir()
  const errorsDir = resolve(htmlDir, 'errors')
  await mkdir(errorsDir, { recursive: true })

  // Resolve paths relative to this file's source location
  // Since tsup bundles everything, we embed the content as strings
  await writeFile(resolve(htmlDir, 'index.html'), indexHtml, 'utf-8')
  await writeFile(resolve(errorsDir, '404.html'), error404Html, 'utf-8')
  await writeFile(resolve(errorsDir, '504.html'), error504Html, 'utf-8')
}

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Denvig Gateway</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { text-align: center; max-width: 480px; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; color: #fff; }
    p { font-size: 0.95rem; line-height: 1.6; color: #888; margin-bottom: 1.5rem; }
    a { color: #6ea4f7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #1a1a1a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85rem; color: #ccc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Denvig Gateway</h1>
    <p>This nginx server is managed by <a href="https://denvig.com">Denvig</a>.</p>
    <p>Configure services with <code>http.domain</code> in your <code>.denvig.yml</code> to route traffic here.</p>
  </div>
</body>
</html>
`

const error404Html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 - Not Found</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { text-align: center; max-width: 480px; padding: 2rem; }
    .code { font-size: 3rem; font-weight: 700; color: #555; margin-bottom: 0.5rem; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; color: #fff; }
    p { font-size: 0.95rem; line-height: 1.6; color: #888; margin-bottom: 1rem; }
    a { color: #6ea4f7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #1a1a1a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85rem; color: #ccc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="code">404</div>
    <h1>Service Not Found</h1>
    <p>No service is configured for this domain. The project may not exist or the domain is not set up in <code>.denvig.yml</code>.</p>
    <p>Check your configuration with <code>denvig gateway status</code></p>
    <p><a href="https://denvig.com">denvig.com</a></p>
  </div>
</body>
</html>
`

const error504Html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>504 - Service Unavailable</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { text-align: center; max-width: 480px; padding: 2rem; }
    .code { font-size: 3rem; font-weight: 700; color: #555; margin-bottom: 0.5rem; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; color: #fff; }
    p { font-size: 0.95rem; line-height: 1.6; color: #888; margin-bottom: 1rem; }
    a { color: #6ea4f7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #1a1a1a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85rem; color: #ccc; }
  </style>
</head>
<body>
  <div class="container">
    <div class="code">504</div>
    <h1>Service Unavailable</h1>
    <p>This service is configured but does not appear to be running. Start it with <code>denvig services start</code>.</p>
    <p>Check service status with <code>denvig services</code></p>
    <p><a href="https://denvig.com">denvig.com</a></p>
  </div>
</body>
</html>
`
