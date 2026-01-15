import { defineConfig } from 'tsup'

export default defineConfig([
  // CLI - CJS only (avoids chunk splitting)
  {
    entry: ['src/cli.ts'],
    minify: true,
    format: ['cjs'],
    sourcemap: false,
    clean: true,
  },
  // SDK - CJS + ESM with types
  {
    entry: ['src/sdk.ts'],
    minify: true,
    format: ['cjs', 'esm'],
    sourcemap: false,
    dts: true,
  },
])
