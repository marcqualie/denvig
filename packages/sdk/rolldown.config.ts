import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const externalDeps = ['node-forge', 'semver', 'yaml', 'zod']
const isExternal = (id: string) =>
  externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`))

const input = { index: 'src/index.ts', unsafe: 'src/unsafe.ts' }

export default defineConfig([
  // SDK - ESM bundle + bundled .d.ts
  {
    input,
    platform: 'node',
    external: isExternal,
    plugins: [dts()],
    output: {
      dir: 'dist',
      format: 'es',
      minify: true,
      sourcemap: false,
      entryFileNames: '[name].js',
      chunkFileNames: '[name]-[hash].js',
    },
  },
  // SDK - CJS bundle. Shared chunks must use the `.cjs` extension so the CJS
  // entries `require()` CJS chunks rather than the ESM `.js` chunks (the package
  // is `type: module`, so a bare `.js` chunk would be loaded as ESM).
  {
    input,
    platform: 'node',
    external: isExternal,
    output: {
      dir: 'dist',
      format: 'cjs',
      minify: true,
      sourcemap: false,
      entryFileNames: '[name].cjs',
      chunkFileNames: '[name]-[hash].cjs',
    },
  },
])
