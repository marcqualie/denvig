import { defineConfig } from 'rolldown'

/**
 * The daemon is a single self-contained binary. `@denvig/sdk` and its
 * dependencies are bundled from source (via the `denvig-source` condition) so
 * installing `denvigd` pulls in nothing else at runtime.
 */
export default defineConfig({
  input: 'src/denvigd.ts',
  platform: 'node',
  resolve: {
    conditionNames: ['denvig-source', 'import', 'default', 'node'],
  },
  output: {
    file: 'dist/denvigd.cjs',
    format: 'cjs',
    minify: true,
    sourcemap: false,
    codeSplitting: false,
  },
})
