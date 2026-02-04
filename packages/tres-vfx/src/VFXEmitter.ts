import { defineComponent, ref, watch, onMounted, onUnmounted, h, type PropType } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import { Vector3, Quaternion, Group } from 'three/webgpu'
import {
  EmitterController,
  isWebGPUBackend,
  coreStore,
  type EmitterControllerOptions,
} from 'core-vfx'

// Reusable temp objects for transforms (avoid allocations in render loop)
const worldPos = new Vector3()
const worldQuat = new Quaternion()

export const VFXEmitter = defineComponent({
  name: 'VFXEmitter',
  props: {
    name: { type: String, default: undefined },
    particlesRef: { type: Object, default: undefined },
    position: {
      type: null as unknown as PropType<[number, number, number]>,
      default: () => [0, 0, 0],
    },
    emitCount: { type: Number, default: 10 },
    delay: { type: Number, default: 0 },
    autoStart: { type: Boolean, default: true },
    loop: { type: Boolean, default: true },
    localDirection: { type: Boolean, default: false },
    direction: {
      type: null as unknown as PropType<EmitterControllerOptions['direction']>,
      default: undefined,
    },
    overrides: {
      type: Object as PropType<Record<string, unknown> | null>,
      default: null,
    },
    onEmit: {
      type: Function as PropType<EmitterControllerOptions['onEmit']>,
      default: undefined,
    },
  },
  setup(props, { expose, slots }) {
    const { renderer } = useTresContext()
    const { onBeforeRender } = useLoop()

    const groupRef = ref<Group | null>(null)
    const isWebGPU = ref(false)

    const controller = new EmitterController({
      emitCount: props.emitCount,
      delay: props.delay,
      autoStart: props.autoStart,
      loop: props.loop,
      localDirection: props.localDirection,
      direction: props.direction,
      overrides: props.overrides,
      onEmit: props.onEmit,
    })

    function getParticleSystem() {
      if (props.particlesRef) {
        return props.particlesRef.value || props.particlesRef
      }
      return props.name ? coreStore.getState().getParticles(props.name) : undefined
    }

    // Watch option changes
    watch(
      () => [
        props.emitCount,
        props.delay,
        props.autoStart,
        props.loop,
        props.localDirection,
        props.direction,
        props.overrides,
        props.onEmit,
      ],
      () => {
        controller.updateOptions({
          emitCount: props.emitCount,
          delay: props.delay,
          autoStart: props.autoStart,
          loop: props.loop,
          localDirection: props.localDirection,
          direction: props.direction,
          overrides: props.overrides,
          onEmit: props.onEmit,
        })
      }
    )

    function checkWebGPU() {
      const r = renderer.instance
      if (r && isWebGPUBackend(r)) {
        isWebGPU.value = true
        const system = getParticleSystem()
        if (system) controller.setSystem(system)
      }
    }

    onMounted(() => {
      // Cast needed: isInitialized/onReady exist at runtime but tsup DTS doesn't resolve them
      const mgr = renderer as any
      if (mgr.isInitialized?.value) {
        checkWebGPU()
      } else if (mgr.onReady) {
        mgr.onReady(() => {
          checkWebGPU()
        })
      } else {
        checkWebGPU()
      }
    })

    // Frame loop
    onBeforeRender(({ delta }) => {
      if (!isWebGPU.value) return

      // Re-resolve system if not linked yet
      if (!controller.getSystem()) {
        const system = getParticleSystem()
        if (system) controller.setSystem(system)
      }

      const group = groupRef.value
      if (!group) return

      group.getWorldPosition(worldPos)
      group.getWorldQuaternion(worldQuat)
      controller.update(delta, worldPos, worldQuat)
    })

    const emit = (emitOverrides: Record<string, unknown> | null = null) => {
      const group = groupRef.value
      if (!group) return false

      if (!controller.getSystem()) {
        const system = getParticleSystem()
        if (system) controller.setSystem(system)
      }

      if (!controller.getSystem()) {
        if (props.name) {
          console.warn(
            `VFXEmitter: No particle system found for name "${props.name}"`
          )
        }
        return false
      }

      group.getWorldPosition(worldPos)
      group.getWorldQuaternion(worldQuat)
      return controller.emitAtPosition(worldPos, worldQuat, emitOverrides)
    }

    const burst = (count: number) => {
      const group = groupRef.value
      if (!group) return false

      if (!controller.getSystem()) {
        const system = getParticleSystem()
        if (system) controller.setSystem(system)
      }

      if (!controller.getSystem()) return false

      group.getWorldPosition(worldPos)
      group.getWorldQuaternion(worldQuat)
      return controller.burst(count, worldPos, worldQuat)
    }

    const start = () => controller.start()
    const stop = () => controller.stop()

    expose({
      emit,
      burst,
      start,
      stop,
      get isEmitting() {
        return controller.isEmitting
      },
      getParticleSystem,
      get group() {
        return groupRef.value
      },
    })

    return () => {
      return h(
        'TresGroup',
        {
          ref: (el: any) => {
            groupRef.value = el
          },
          position: props.position,
        },
        slots.default ? slots.default() : undefined
      )
    }
  },
})

/**
 * Composable for programmatic emitter control
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
  const { renderer } = useTresContext()

  const isWebGPU = ref(false)

  onMounted(() => {
    // Cast needed: isInitialized/onReady exist at runtime but tsup DTS doesn't resolve them
    const mgr = renderer as any
    if (mgr.isInitialized?.value) {
      const r = renderer.instance
      if (r && isWebGPUBackend(r)) {
        isWebGPU.value = true
      }
    } else if (mgr.onReady) {
      mgr.onReady((r: any) => {
        if (isWebGPUBackend(r)) {
          isWebGPU.value = true
        }
      })
    } else {
      const r = renderer.instance
      if (r && isWebGPUBackend(r)) {
        isWebGPU.value = true
      }
    }
  })

  const getParticles = () => coreStore.getState().getParticles(name)

  const emit = (
    position: [number, number, number] = [0, 0, 0],
    count = 20,
    overrides: Record<string, unknown> | null = null
  ) => {
    if (!isWebGPU.value) return false
    const [x, y, z] = position
    return coreStore.getState().emit(name, { x, y, z, count, overrides })
  }

  const burst = (
    position: [number, number, number] = [0, 0, 0],
    count = 50,
    overrides: Record<string, unknown> | null = null
  ) => {
    if (!isWebGPU.value) return false
    const [x, y, z] = position
    return coreStore.getState().emit(name, { x, y, z, count, overrides })
  }

  const start = () => {
    if (!isWebGPU.value) return false
    return coreStore.getState().start(name)
  }

  const stop = () => {
    if (!isWebGPU.value) return false
    return coreStore.getState().stop(name)
  }

  const clear = () => {
    if (!isWebGPU.value) return false
    return coreStore.getState().clear(name)
  }

  const isEmitting = () => {
    if (!isWebGPU.value) return false
    const particles = getParticles()
    return particles?.isEmitting ?? false
  }

  const getUniforms = () => {
    if (!isWebGPU.value) return null
    const particles = getParticles()
    return particles?.uniforms ?? null
  }

  return {
    emit,
    burst,
    start,
    stop,
    clear,
    isEmitting,
    getUniforms,
    getParticles: () => (isWebGPU.value ? getParticles() : null),
  }
}

export type VFXEmitterProps = InstanceType<typeof VFXEmitter>['$props']
