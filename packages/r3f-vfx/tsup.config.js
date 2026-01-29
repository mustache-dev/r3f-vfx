import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/curveWorker.js'],
  clean: true,
  format: ['esm'],
  dts: true,
  splitting: false,
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.js': 'jsx',
    }
  },
})
