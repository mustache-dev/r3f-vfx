import { defineConfig } from 'vite'
import { templateCompilerOptions } from '@tresjs/core'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue(templateCompilerOptions)],
  resolve: {
    alias: {
      vue: path.resolve(__dirname, '../../node_modules/vue'),
      '@tresjs/core': path.resolve(
        __dirname,
        '../../node_modules/@tresjs/core'
      ),
      // Specific three aliases must come BEFORE the generic 'three' alias
      'three/addons': path.resolve(
        __dirname,
        '../../node_modules/three/examples/jsm'
      ),
      'three/tsl': path.resolve(
        __dirname,
        '../../node_modules/three/build/three.tsl.js'
      ),
      'three/webgpu': path.resolve(
        __dirname,
        '../../node_modules/three/build/three.webgpu.js'
      ),
      three: path.resolve(__dirname, '../../node_modules/three'),
    },
  },
})
