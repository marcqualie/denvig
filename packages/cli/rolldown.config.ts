import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const externalDeps = ['node-forge', 'semver', 'yaml', 'zod']
const isExternal = (id: string) =>
  externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`))

/**
 * The binary bundles `@denvig/sdk` from source so it is self-contained, but the
 * `.` SDK re-export keeps `@denvig/sdk` external — it should resolve to the same
 * published package at runtime rather than ship a duplicate copy.
 */
const isExternalWithSdk = (id: string) =>
  isExternal(id) || id === '@denvig/sdk' || id.startsWith('@denvig/sdk/')

/**
 * `@denvig/sdk` is bundled into the CLI binary from source. The `denvig-source`
 * condition resolves its subpath imports (`@denvig/sdk/lib/...`) to the SDK's
 * TypeScript sources.
 */
const resolve = {
  conditionNames: ['denvig-source', 'import', 'default', 'node'],
}

export default defineConfig([
  // CLI - CJS only
  {
    input: 'src/cli.ts',
    platform: 'node',
    resolve,
    external: isExternal,
    output: {
      file: 'dist/cli.cjs',
      format: 'cjs',
      minify: true,
      sourcemap: false,
      codeSplitting: false,
    },
  },
  // SDK - ESM bundle + bundled .d.ts
  {
    input: 'src/sdk.ts',
    platform: 'node',
    resolve,
    external: isExternalWithSdk,
    plugins: [dts()],
    output: {
      dir: 'dist',
      format: 'es',
      minify: true,
      sourcemap: false,
      codeSplitting: false,
      entryFileNames: '[name].js',
    },
  },
  // SDK - CJS bundle
  {
    input: 'src/sdk.ts',
    platform: 'node',
    resolve,
    external: isExternalWithSdk,
    output: {
      file: 'dist/sdk.cjs',
      format: 'cjs',
      minify: true,
      sourcemap: false,
      codeSplitting: false,
    },
  },
])
