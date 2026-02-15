import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  ReactNode,
  RefObject,
} from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, Quaternion, Group } from 'three/webgpu'
import { useVFXStore } from './react-store'
import { EmitterController, type EmitterControllerOptions } from 'core-vfx'

export interface VFXEmitterProps extends EmitterControllerOptions {
  /** Name of the registered VFXParticles system */
  name?: string
  /** Direct ref to VFXParticles (alternative to name) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  particlesRef?: RefObject<any> | any
  /** Local position offset */
  position?: [number, number, number]
  /** Children elements */
  children?: ReactNode
}

// Reusable temp objects for transforms (avoid allocations in render loop)
const worldPos = new Vector3()
const worldQuat = new Quaternion()

export const VFXEmitter = forwardRef(function VFXEmitter(
  {
    name,
    particlesRef,
    position = [0, 0, 0],
    emitCount = 10,
    delay = 0,
    autoStart = true,
    loop = true,
    localDirection = false,
    direction,
    overrides = null,
    onEmit,
    children,
  }: VFXEmitterProps,
  ref
) {
  const groupRef = useRef<Group>(null)

  // Create controller
  const controllerRef = useRef<EmitterController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new EmitterController({
      emitCount,
      delay,
      autoStart,
      loop,
      localDirection,
      direction,
      overrides,
      onEmit,
    })
  }
  const controller = controllerRef.current

  // Get particle system from store or direct ref
  const getParticleSystem = useCallback(() => {
    if (particlesRef) {
      return particlesRef.current || particlesRef
    }
    // @ts-expect-error Zustand store getState
    return useVFXStore.getState().getParticles(name)
  }, [name, particlesRef])

  // Link controller to particle system
  useEffect(() => {
    const system = getParticleSystem()
    controller.setSystem(system)
  }, [getParticleSystem, controller])

  // Update controller options when props change
  useEffect(() => {
    controller.updateOptions({
      emitCount,
      delay,
      autoStart,
      loop,
      localDirection,
      direction,
      overrides,
      onEmit,
    })
  }, [
    controller,
    emitCount,
    delay,
    autoStart,
    loop,
    localDirection,
    direction,
    overrides,
    onEmit,
  ])

  // Re-resolve system on each frame in case it registered late
  useFrame((_, delta) => {
    if (!controller.getSystem()) {
      const system = getParticleSystem()
      if (system) controller.setSystem(system)
    }

    if (!groupRef.current) return

    groupRef.current.getWorldPosition(worldPos)
    groupRef.current.getWorldQuaternion(worldQuat)
    controller.update(delta, worldPos, worldQuat)
  })

  // Emit function with position resolution
  const emit = useCallback(
    (emitOverrides: Record<string, unknown> | null = null) => {
      if (!groupRef.current) return false

      // Re-resolve system in case it was registered late
      if (!controller.getSystem()) {
        const system = getParticleSystem()
        if (system) controller.setSystem(system)
      }

      if (!controller.getSystem()) {
        if (name) {
          console.warn(
            `VFXEmitter: No particle system found for name "${name}"`
          )
        }
        return false
      }

      groupRef.current.getWorldPosition(worldPos)
      groupRef.current.getWorldQuaternion(worldQuat)
      return controller.emitAtPosition(worldPos, worldQuat, emitOverrides)
    },
    [controller, getParticleSystem, name]
  )

  // Burst
  const burst = useCallback(
    (count: number) => {
      if (!groupRef.current) return false

      // Re-resolve system
      if (!controller.getSystem()) {
        const system = getParticleSystem()
        if (system) controller.setSystem(system)
      }

      if (!controller.getSystem()) return false

      groupRef.current.getWorldPosition(worldPos)
      groupRef.current.getWorldQuaternion(worldQuat)
      return controller.burst(count, worldPos, worldQuat)
    },
    [controller, getParticleSystem]
  )

  // Start/stop
  const start = useCallback(() => controller.start(), [controller])
  const stop = useCallback(() => controller.stop(), [controller])

  // Expose control methods via ref
  useImperativeHandle(
    ref,
    () => ({
      emit,
      burst,
      start,
      stop,
      get isEmitting() {
        return controller.isEmitting
      },
      getParticleSystem,
      get group() {
        return groupRef.current
      },
    }),
    [emit, burst, start, stop, controller, getParticleSystem]
  )

  // Render a group that inherits parent transforms
  return (
    // @ts-ignore
    <group ref={groupRef} position={position}>
      {children}
      {/* @ts-ignore */}
    </group>
  )
})

/**
 * Higher-order hook for programmatic emitter control
 *
 * Usage:
 * const { emit, burst, start, stop } = useVFXEmitter("sparks");
 *
 * // Emit at a position
 * emit([1, 2, 3], 50);
 *
 * // Burst with overrides
 * burst([0, 0, 0], 100, { colorStart: ["#ff0000"] });
 */
export function useVFXEmitter(name: string) {
  const getParticles = useVFXStore((s) => s.getParticles)
  const storeEmit = useVFXStore((s) => s.emit)
  const storeStart = useVFXStore((s) => s.start)
  const storeStop = useVFXStore((s) => s.stop)
  const storeClear = useVFXStore((s) => s.clear)

  const emit = useCallback(
    (position = [0, 0, 0], count = 20, overrides = null) => {
      const [x, y, z] = position
      return storeEmit(name, { x, y, z, count, overrides })
    },
    [name, storeEmit]
  )

  const burst = useCallback(
    (position = [0, 0, 0], count = 50, overrides = null) => {
      const [x, y, z] = position
      return storeEmit(name, { x, y, z, count, overrides })
    },
    [name, storeEmit]
  )

  const start = useCallback(() => {
    return storeStart(name)
  }, [name, storeStart])

  const stop = useCallback(() => {
    return storeStop(name)
  }, [name, storeStop])

  const clear = useCallback(() => {
    return storeClear(name)
  }, [name, storeClear])

  const isEmitting = useCallback(() => {
    const particles = getParticles(name)
    return particles?.isEmitting ?? false
  }, [name, getParticles])

  const getUniforms = useCallback(() => {
    const particles = getParticles(name)
    return particles?.uniforms ?? null
  }, [name, getParticles])

  return {
    emit,
    burst,
    start,
    stop,
    clear,
    isEmitting,
    getUniforms,
    getParticles: () => getParticles(name),
  }
}

export default VFXEmitter
