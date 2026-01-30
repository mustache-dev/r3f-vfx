import * as THREE from 'three/webgpu'
import { Canvas, extend } from '@react-three/fiber'
import SceneLight from './SceneLight'
import { Suspense } from 'react'
import { KeyboardControls, Loader, OrbitControls } from '@react-three/drei'
import { WebGPUPostProcessing } from './WebGPUPostprocessing'
import { WobblySphere } from './WobblySphere'
import { Floor } from './Floor'
import Player from './Player'
import { Boom } from './Boom'
// import { Particles } from './Particles'

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

      <Canvas
        shadows
        renderer
      >
        <Suspense fallback={null}>
          <SceneLight />
          <WebGPUPostProcessing />
          <Floor />
          <KeyboardControls map={keyboardMap}>
            <Player />
          </KeyboardControls>
          <Boom />
          {/* <Particles /> */}
          {/* <WobblySphere/> */}
        </Suspense>
      </Canvas>

      <Loader />
    </>
  )
}
