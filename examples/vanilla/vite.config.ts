import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
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
