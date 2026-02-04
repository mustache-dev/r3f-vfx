import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  format: ['esm'],
  dts: true,
  splitting: false,
  external: [
    'vue',
    '@tresjs/core',
    'three',
    'three/webgpu',
    'three/tsl',
    'core-vfx',
    'debug-vfx',
  ],
})
