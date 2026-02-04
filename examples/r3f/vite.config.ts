import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  resolve: {
    alias: {
      react: path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
      '@react-three/fiber': path.resolve(
        __dirname,
        '../../node_modules/@react-three/fiber'
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
