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
import type { Quaternion as QuaternionType } from 'three'
import { useVFXStore } from './react-store'

export interface VFXEmitterProps {
  /** Name of the registered VFXParticles system */
  name?: string
  /** Direct ref to VFXParticles (alternative to name) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  particlesRef?: RefObject<any> | any
  /** Local position offset */
  position?: [number, number, number]
  /** Particles to emit per burst */
  emitCount?: number
  /** Seconds between emissions (0 = every frame) */
  delay?: number
  /** Start emitting automatically */
  autoStart?: boolean
  /** Keep emitting (false = emit once) */
  loop?: boolean
  /** Transform direction by parent's world rotation */
  localDirection?: boolean
  /** Direction override [[minX,maxX],[minY,maxY],[minZ,maxZ]] */
  direction?: [[number, number], [number, number], [number, number]]
  /** Per-spawn overrides (size, speed, colors, etc.) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overrides?: Record<string, any> | null
  /** Callback fired after each emission */
  onEmit?: (params: {
    position: [number, number, number] | number[]
    count: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    direction: any
  }) => void
  /** Children elements */
  children?: ReactNode
}

// Reusable temp objects for transforms (avoid allocations in render loop)
const _worldPos = new Vector3()
const _worldQuat = new Quaternion()
const _tempVec = new Vector3()

/**
 * VFXEmitter - A reusable emitter component that links to a VFXParticles system
 *
 * Multiple VFXEmitters can share a single VFXParticles instance without adding
 * supplementary draw calls. Each emitter just calls spawn() on the shared system.
 *
 * The emitter renders a <group> that inherits parent transforms automatically,
 * so you can place it as a child of any object and it will follow.
 *
 * Usage:
 *
 * // First, set up a VFXParticles with a name
 * <VFXParticles name="sparks" maxParticles={1000} autoStart={false} ... />
 *
 * // Place emitter as child - it automatically follows parent transforms!
 * <group ref={playerRef}>
 *   <VFXEmitter
 *     name="sparks"
 *     position={[0, 1, 0]}  // Local offset from parent
 *     emitCount={5}
 *     delay={0.1}
 *   />
 * </group>
 *
 * // Use localDirection to emit relative to parent's rotation
 * <VFXEmitter
 *   name="sparks"
 *   direction={[[0, 0], [0, 0], [-1, -1]]}  // Emit backward in local space
 *   localDirection={true}  // Direction is transformed by parent's rotation
 * />
 *
 * @param {object} props
 * @param {string} props.name - Name of the registered VFXParticles system
 * @param {object} [props.particlesRef] - Direct ref to VFXParticles (alternative to name)
 * @param {[number, number, number]} [props.position=[0,0,0]] - Local position offset
 * @param {number} [props.emitCount=10] - Particles to emit per burst
 * @param {number} [props.delay=0] - Seconds between emissions (0 = every frame)
 * @param {boolean} [props.autoStart=true] - Start emitting automatically
 * @param {boolean} [props.loop=true] - Keep emitting (false = emit once)
 * @param {boolean} [props.localDirection=false] - Transform direction by parent's world rotation
 * @param {array} [props.direction] - Direction override [[minX,maxX],[minY,maxY],[minZ,maxZ]]
 * @param {object} [props.overrides] - Per-spawn overrides (size, speed, colors, etc.)
 * @param {function} [props.onEmit] - Callback fired after each emission
 */
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
  const emitAccumulator = useRef(0)
  const emitting = useRef(autoStart)
  const hasEmittedOnce = useRef(false)

  // Get particle system from store or direct ref
  const getParticleSystem = useCallback(() => {
    if (particlesRef) {
      return particlesRef.current || particlesRef
    }
    // @ts-expect-error Zustand store getState
    return useVFXStore.getState().getParticles(name)
  }, [name, particlesRef])

  // Transform a direction range by quaternion
  const transformDirectionByQuat = useCallback(
    (
      dirRange: [[number, number], [number, number], [number, number]],
      quat: QuaternionType
    ): [[number, number], [number, number], [number, number]] => {
      // Transform min and max direction vectors
      // dirRange format: [[minX, maxX], [minY, maxY], [minZ, maxZ]]
      const minDir = _tempVec.set(
        dirRange[0][0],
        dirRange[1][0],
        dirRange[2][0]
      )
      minDir.applyQuaternion(quat)

      const maxDir = new Vector3(dirRange[0][1], dirRange[1][1], dirRange[2][1])
      maxDir.applyQuaternion(quat)

      // Return transformed ranges (maintain min/max relationship per axis)
      return [
        [Math.min(minDir.x, maxDir.x), Math.max(minDir.x, maxDir.x)],
        [Math.min(minDir.y, maxDir.y), Math.max(minDir.y, maxDir.y)],
        [Math.min(minDir.z, maxDir.z), Math.max(minDir.z, maxDir.z)],
      ]
    },
    []
  )

  // Get current emission position and optionally transformed direction
  const getEmitParams = useCallback(() => {
    if (!groupRef.current) {
      return { position: position, direction: direction }
    }

    let emitDir = direction

    // Always get world position of the group (where particles will spawn)
    groupRef.current.getWorldPosition(_worldPos)
    const emitPos = [_worldPos.x, _worldPos.y, _worldPos.z]

    // Transform direction by world quaternion if localDirection is enabled
    if (localDirection && direction) {
      groupRef.current.getWorldQuaternion(_worldQuat)
      emitDir = transformDirectionByQuat(direction, _worldQuat)
    }

    return { position: emitPos, direction: emitDir }
  }, [localDirection, direction, position, transformDirectionByQuat])

  // Emit function - accepts optional overrides that merge with component overrides
  const emit = useCallback(
    (emitOverrides: Record<string, unknown> | null = null) => {
      const particles = getParticleSystem()
      if (!particles?.spawn) {
        if (name) {
          console.warn(
            `VFXEmitter: No particle system found for name "${name}"`
          )
        }
        return false
      }

      const { position: emitPos, direction: emitDir } = getEmitParams()
      const [x, y, z] = emitPos

      // Check if emit-time overrides include a direction
      const emitTimeDirection = emitOverrides?.direction as
        | [[number, number], [number, number], [number, number]]
        | undefined

      // If emit-time direction provided and localDirection enabled, transform it
      let finalDir = emitDir
      if (emitTimeDirection && localDirection && groupRef.current) {
        groupRef.current.getWorldQuaternion(_worldQuat)
        finalDir = transformDirectionByQuat(emitTimeDirection, _worldQuat)
      } else if (emitTimeDirection) {
        // Use emit-time direction as-is (no localDirection transform)
        finalDir = emitTimeDirection
      }

      // Merge: component overrides -> emit-time overrides (without direction) -> final direction
      const { direction: _, ...emitOverridesWithoutDir } = emitOverrides || {}
      const mergedOverrides = { ...overrides, ...emitOverridesWithoutDir }
      const finalOverrides = finalDir
        ? { ...mergedOverrides, direction: finalDir }
        : mergedOverrides

      particles.spawn(x, y, z, emitCount, finalOverrides)

      if (onEmit) {
        onEmit({ position: emitPos, count: emitCount, direction: finalDir })
      }

      return true
    },
    [
      getParticleSystem,
      getEmitParams,
      name,
      emitCount,
      overrides,
      onEmit,
      localDirection,
      transformDirectionByQuat,
    ]
  )

  // Auto-emission logic
  useFrame((_, delta) => {
    if (!emitting.current) return

    // If not looping and already emitted, stop
    if (!loop && hasEmittedOnce.current) {
      return
    }

    if (delay <= 0) {
      // Emit every frame
      const success = emit()
      if (success) hasEmittedOnce.current = true
    } else {
      // Emit on interval
      emitAccumulator.current += delta

      if (emitAccumulator.current >= delay) {
        emitAccumulator.current -= delay
        const success = emit()
        if (success) hasEmittedOnce.current = true
      }
    }
  })

  // Start/stop control methods
  const start = useCallback(() => {
    emitting.current = true
    hasEmittedOnce.current = false
    emitAccumulator.current = 0
  }, [])

  const stop = useCallback(() => {
    emitting.current = false
  }, [])

  // Burst: emit once immediately, regardless of autoStart
  const burst = useCallback(
    (count: number) => {
      const particles = getParticleSystem()
      if (!particles?.spawn) return false

      const { position: emitPos, direction: emitDir } = getEmitParams()
      const [x, y, z] = emitPos

      const finalOverrides = emitDir
        ? { ...overrides, direction: emitDir }
        : overrides

      particles.spawn(x, y, z, count ?? emitCount, finalOverrides)

      if (onEmit) {
        onEmit({
          position: emitPos,
          count: count ?? emitCount,
          direction: emitDir,
        })
      }

      return true
    },
    [getParticleSystem, getEmitParams, emitCount, overrides, onEmit]
  )

  // Update emitting state when autoStart changes
  useEffect(() => {
    emitting.current = autoStart
    if (autoStart) {
      hasEmittedOnce.current = false
      emitAccumulator.current = 0
    }
  }, [autoStart])

  // Expose control methods via ref
  useImperativeHandle(
    ref,
    () => ({
      /** Emit particles at current position */
      emit,
      /** Burst emit - emit immediately regardless of autoStart */
      burst,
      /** Start auto-emission */
      start,
      /** Stop auto-emission */
      stop,
      /** Check if currently emitting */
      get isEmitting() {
        return emitting.current
      },
      /** Get the linked particle system */
      getParticleSystem,
      /** Get the group ref for direct access */
      get group() {
        return groupRef.current
      },
    }),
    [emit, burst, start, stop, getParticleSystem]
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

  const start = useCallback(() => storeStart(name), [name, storeStart])
  const stop = useCallback(() => storeStop(name), [name, storeStop])
  const clear = useCallback(() => storeClear(name), [name, storeClear])

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
