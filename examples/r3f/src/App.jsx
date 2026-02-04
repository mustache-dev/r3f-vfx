import * as THREE from 'three/webgpu'
import { Canvas, useLoader } from '@react-three/fiber'
import SceneLight from './SceneLight'
import { Suspense } from 'react'
import { KeyboardControls, Loader } from '@react-three/drei'
import { WebGPUPostProcessing } from './WebGPUPostprocessing'
import { Floor } from './Floor'
import Player from './Player'
import { Boom } from './Boom'
import { VFXParticles } from 'r3f-vfx'

function FallbackSprite() {
  const texture = useLoader(THREE.TextureLoader, './fallback.png')
  return <sprite scale={[3, 3, 1]}><spriteMaterial map={texture} /></sprite>
}

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
      <Canvas shadows renderer={{ forceWebGL: false }}>
        <Suspense fallback={null}>
          <SceneLight />
          <WebGPUPostProcessing />
          <Floor />
          <KeyboardControls map={keyboardMap}>
            <Player />
          </KeyboardControls>
          <Boom />
          <group position={[5, 0, 0]}>
            <VFXParticles debug fallback={<FallbackSprite />} />
          </group>
        </Suspense>
      </Canvas>

      <Loader />
    </>
  )
}
