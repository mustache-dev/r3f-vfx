import * as THREE from 'three/webgpu'
import { Canvas, extend } from '@react-three/fiber'
import SceneLight from './SceneLight'
import { Suspense } from 'react'
import { KeyboardControls, Loader, OrbitControls } from '@react-three/drei'
import { WebGPUPostProcessing } from './WebGPUPostprocessing'
import { WobblySphere } from './WobblySphere'
import { Floor } from './Floor'
import Player from './Player'
import { Particles } from './Particles'
import { Spark } from './Spark'

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'attack', keys: ['KeyE'] },
]

export default function App() {
  return (
    <>
      <KeyboardControls map={keyboardMap}>
        <Canvas
          shadows
          gl={async (props) => {
            extend(THREE)
            const renderer = new THREE.WebGPURenderer(props)

            await renderer.init()
            return renderer
          }}
        >
          <Suspense fallback={null}>
            <SceneLight />
            <WebGPUPostProcessing />
            <Floor />
            <Player />
            <Spark />
            <Particles />
            {/* <WobblySphere/> */}
          </Suspense>
        </Canvas>
      </KeyboardControls>

      <Loader />
    </>
  )
}
