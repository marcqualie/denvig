import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

/**
 * `@denvig/cli` is kept external so the published `denvig` package depends on
 * it at runtime rather than bundling a copy. Locally this resolves through the
 * `workspace:` dependency; when published it resolves to the released package.
 */
const isExternal = (id: string) =>
  id === '@denvig/cli' || id.startsWith('@denvig/cli/')

export default defineConfig([
  // Root SDK re-export - ESM bundle + bundled .d.ts
  {
    input: 'src/index.ts',
    platform: 'node',
    external: isExternal,
    plugins: [dts()],
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: false,
      entryFileNames: '[name].js',
    },
  },
  // Root SDK re-export - CJS bundle
  {
    input: 'src/index.ts',
    platform: 'node',
    external: isExternal,
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: false,
    },
  },
  // `denvig/cli` re-export - ESM bundle + bundled .d.ts
  {
    input: 'src/cli.ts',
    platform: 'node',
    external: isExternal,
    plugins: [dts()],
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: false,
      entryFileNames: '[name].js',
    },
  },
  // `denvig/cli` re-export - CJS bundle
  {
    input: 'src/cli.ts',
    platform: 'node',
    external: isExternal,
    output: {
      file: 'dist/cli.cjs',
      format: 'cjs',
      sourcemap: false,
    },
  },
  // `denvig/sdk` re-export - ESM bundle + bundled .d.ts
  {
    input: 'src/sdk.ts',
    platform: 'node',
    external: isExternal,
    plugins: [dts()],
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: false,
      entryFileNames: '[name].js',
    },
  },
  // `denvig/sdk` re-export - CJS bundle
  {
    input: 'src/sdk.ts',
    platform: 'node',
    external: isExternal,
    output: {
      file: 'dist/sdk.cjs',
      format: 'cjs',
      sourcemap: false,
    },
  },
  // Binary launcher - CJS
  {
    input: 'src/bin.ts',
    platform: 'node',
    external: isExternal,
    output: {
      file: 'dist/bin.cjs',
      format: 'cjs',
      sourcemap: false,
    },
  },
])
