import { useFrame } from '@react-three/fiber'
import { useKeyboardControls, PerspectiveCamera } from '@react-three/drei'
import { useRef } from 'react'
import { damp } from 'three/src/math/MathUtils.js'
import { Vector3 } from 'three/webgpu'
import { Model } from './Witch-test'

function Player() {
  const meshRef = useRef()
  const modelRef = useRef()
  const modelAnimRef = useRef()
  const cameraRef = useRef()
  const targetRotation = useRef(0)
  const currentAnimation = useRef('idle-sword')
  const attackPressed = useRef(false)
  // const { emit } = useVFXEmitter('spark')

  const walkSpeed = 5
  const runSpeed = 10

  // Subscribe to keyboard controls
  const [, getKeys] = useKeyboardControls()

  const velocity = useRef(new Vector3(0, 0, 0))

  useFrame(({ camera }, delta) => {
    if (!meshRef.current) return

    const { forward, backward, left, right, run, attack } = getKeys()

    // Handle attack input (edge detection - only trigger on press, not hold)
    if (attack && !attackPressed.current) {
      attackPressed.current = true
      modelAnimRef.current?.attack()
    } else if (!attack) {
      attackPressed.current = false
    }

    // Calculate movement direction
    const moveX = (right ? 1 : 0) - (left ? 1 : 0)
    const moveZ = (backward ? 1 : 0) - (forward ? 1 : 0)
    const speed = run ? runSpeed : walkSpeed

    velocity.current
      .set(moveX, 0, moveZ)
      .normalize()
      .multiplyScalar(speed * delta)

    const isMoving = moveX !== 0 || moveZ !== 0

    // Update position
    meshRef.current.position.add(velocity.current)
    meshRef.current.position.y = -1.2

    // Calculate rotation based on movement direction (top-down view)
    if (isMoving && modelRef.current) {
      // Calculate target angle from movement direction
      targetRotation.current = Math.atan2(-moveX, -moveZ)

      // Smoothly interpolate rotation
      const currentRotation = modelRef.current.rotation.y
      const diff = targetRotation.current - currentRotation

      // Handle angle wrapping
      let shortestDiff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI
      if (shortestDiff < -Math.PI) shortestDiff += Math.PI * 2

      modelRef.current.rotation.y = damp(
        currentRotation,
        currentRotation + shortestDiff,
        10,
        delta
      )
    }

    // Update animation based on movement state (no re-renders)
    const newAnimation = isMoving ? (run ? 'run' : 'walk') : 'idle'
    if (newAnimation !== currentAnimation.current) {
      currentAnimation.current = newAnimation
      modelAnimRef.current?.setAnimation(newAnimation)
    }

    camera.position.x = damp(
      camera.position.x,
      meshRef.current.position.x,
      4,
      delta
    )
    camera.position.z = damp(
      camera.position.z,
      meshRef.current.position.z + 5,
      4,
      delta
    )
    // emit(meshRef.current.position, 1)
  })

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0, 3, 10]}
        fov={45}
        rotation={[-Math.PI / 6, 0, 0]}
        ref={cameraRef}
      />

      {/* VFXParticles at scene root - NOT inside moving groups */}
      {/* <VFXParticles
      name="playerTrail"
      maxParticles={2000}
      autoStart={false}
      colorStart={["#ff6600", "#ffcc00", "#ff3300"]}
      colorEnd={["#ff9900", "#ffaa00"]}
      size={[0.05, 0.12]}
      lifetime={[0.5, 1.2]}
      speed={[2, 10]}
      direction={[[0, 1.5], [0, 0], [-0.5, -1]]}
      gravity={[0, -0.5, 0]}
      fadeOpacity={[1, 0]}
      fadeSize={[1, 0.2]}
      appearance={Appearance.GRADIENT}
      blending={Blending.ADDITIVE}
    /> */}

      <group ref={meshRef}>
        <group ref={modelRef}>
          <Model ref={modelAnimRef} />

          {/* VFXEmitters as children - follow player, emit into world-space VFXParticles */}
          {/* <VFXEmitter
          name="playerTrail"
          position={[0, 0.5, 0]}
          direction={[[0, 0], [0, 0], [0.5, 1]]}
          localDirection={true}
          emitCount={3}
          delay={0}
          autoStart={true}
          overrides={{
            speed: 10,
          }}
        />
        
        <VFXEmitter
          name="playerTrail"
          position={[0, 2, 0]}
          direction={[[0, 0], [0, 0], [-1, -1]]}
          localDirection={false}
          emitCount={2}
          delay={0}
          autoStart={true}
          overrides={{
            speed: [1, 2],
          }}
        /> */}
        </group>
      </group>
    </>
  )
}

export default Player
