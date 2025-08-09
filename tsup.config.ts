import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  minify: true,
  format: ['cjs'],
  sourcemap: false
})
