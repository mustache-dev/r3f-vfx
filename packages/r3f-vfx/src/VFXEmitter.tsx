import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  ReactNode,
  RefObject,
} from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, Quaternion, Group } from 'three/webgpu'
import { useVFXStore } from './react-store'
import {
  EmitterController,
  isWebGPUBackend,
  type EmitterControllerOptions,
} from 'core-vfx'

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
const _worldPos = new Vector3()
const _worldQuat = new Quaternion()

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
  const { gl } = useThree()
  const isWebGPU = useMemo(() => isWebGPUBackend(gl), [gl])
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
    if (!isWebGPU) return
    const system = getParticleSystem()
    controller.setSystem(system)
  }, [isWebGPU, getParticleSystem, controller])

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
    if (!isWebGPU) return
    if (!controller.getSystem()) {
      const system = getParticleSystem()
      if (system) controller.setSystem(system)
    }

    if (!groupRef.current) return

    groupRef.current.getWorldPosition(_worldPos)
    groupRef.current.getWorldQuaternion(_worldQuat)
    controller.update(delta, _worldPos, _worldQuat)
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

      groupRef.current.getWorldPosition(_worldPos)
      groupRef.current.getWorldQuaternion(_worldQuat)
      return controller.emitAtPosition(_worldPos, _worldQuat, emitOverrides)
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

      groupRef.current.getWorldPosition(_worldPos)
      groupRef.current.getWorldQuaternion(_worldQuat)
      return controller.burst(count, _worldPos, _worldQuat)
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
    // @ts-expect-error
    <group ref={groupRef} position={position}>
      {children}
      {/* @ts-expect-error */}
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
  const { gl } = useThree()
  const isWebGPU = useMemo(() => isWebGPUBackend(gl), [gl])

  const getParticles = useVFXStore((s) => s.getParticles)
  const storeEmit = useVFXStore((s) => s.emit)
  const storeStart = useVFXStore((s) => s.start)
  const storeStop = useVFXStore((s) => s.stop)
  const storeClear = useVFXStore((s) => s.clear)

  const emit = useCallback(
    (position = [0, 0, 0], count = 20, overrides = null) => {
      if (!isWebGPU) return false
      const [x, y, z] = position
      return storeEmit(name, { x, y, z, count, overrides })
    },
    [isWebGPU, name, storeEmit]
  )

  const burst = useCallback(
    (position = [0, 0, 0], count = 50, overrides = null) => {
      if (!isWebGPU) return false
      const [x, y, z] = position
      return storeEmit(name, { x, y, z, count, overrides })
    },
    [isWebGPU, name, storeEmit]
  )

  const start = useCallback(() => {
    if (!isWebGPU) return false
    return storeStart(name)
  }, [isWebGPU, name, storeStart])

  const stop = useCallback(() => {
    if (!isWebGPU) return false
    return storeStop(name)
  }, [isWebGPU, name, storeStop])

  const clear = useCallback(() => {
    if (!isWebGPU) return false
    return storeClear(name)
  }, [isWebGPU, name, storeClear])

  const isEmitting = useCallback(() => {
    if (!isWebGPU) return false
    const particles = getParticles(name)
    return particles?.isEmitting ?? false
  }, [isWebGPU, name, getParticles])

  const getUniforms = useCallback(() => {
    if (!isWebGPU) return null
    const particles = getParticles(name)
    return particles?.uniforms ?? null
  }, [isWebGPU, name, getParticles])

  return {
    emit,
    burst,
    start,
    stop,
    clear,
    isEmitting,
    getUniforms,
    getParticles: () => (isWebGPU ? getParticles(name) : null),
  }
}

export default VFXEmitter
