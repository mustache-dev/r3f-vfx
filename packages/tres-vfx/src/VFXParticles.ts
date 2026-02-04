import {
  defineComponent,
  ref,
  watch,
  onMounted,
  onUnmounted,
  h,
  shallowRef,
  type PropType,
} from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import * as THREE from 'three/webgpu'
import { coreStore } from 'core-vfx'
import {
  Appearance,
  Blending,
  EmitterShape,
  Lighting,
  VFXParticleSystem,
  isWebGPUBackend,
  isNonDefaultRotation,
  normalizeProps,
  updateUniforms,
  updateUniformsPartial,
  resolveFeatures,
  type VFXParticleSystemOptions,
  type TurbulenceConfig,
  type AttractorConfig,
  type CollisionConfig,
  type FrictionConfig,
  type FlipbookConfig,
  type StretchConfig,
  type Rotation3DInput,
} from 'core-vfx'

let warnedWebGL = false

export const VFXParticles = defineComponent({
  name: 'VFXParticles',
  props: {
    name: { type: String, default: undefined },
    debug: { type: Boolean, default: false },
    maxParticles: { type: Number, default: 10000 },
    size: {
      type: null as unknown as PropType<[number, number] | number>,
      default: () => [0.1, 0.3],
    },
    colorStart: {
      type: Array as PropType<string[]>,
      default: () => ['#ffffff'],
    },
    colorEnd: {
      type: null as unknown as PropType<string[] | null>,
      default: null,
    },
    fadeSize: {
      type: null as unknown as PropType<[number, number]>,
      default: () => [1, 0],
    },
    fadeSizeCurve: { type: null as unknown as PropType<unknown[] | null>, default: null },
    fadeOpacity: {
      type: null as unknown as PropType<[number, number]>,
      default: () => [1, 0],
    },
    fadeOpacityCurve: { type: null as unknown as PropType<unknown[] | null>, default: null },
    velocityCurve: { type: null as unknown as PropType<unknown[] | null>, default: null },
    gravity: {
      type: null as unknown as PropType<[number, number, number]>,
      default: () => [0, 0, 0],
    },
    lifetime: {
      type: null as unknown as PropType<[number, number]>,
      default: () => [1, 2],
    },
    direction: {
      type: null as unknown as PropType<VFXParticleSystemOptions['direction']>,
      default: () => [
        [-1, 1],
        [0, 1],
        [-1, 1],
      ],
    },
    startPosition: {
      type: null as unknown as PropType<VFXParticleSystemOptions['startPosition']>,
      default: () => [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    },
    speed: {
      type: null as unknown as PropType<[number, number] | number>,
      default: () => [0.1, 0.1],
    },
    friction: {
      type: Object as PropType<FrictionConfig>,
      default: () => ({ intensity: 0, easing: 'linear' }),
    },
    appearance: {
      type: null as unknown as PropType<string | number>,
      default: Appearance.GRADIENT,
    },
    alphaMap: { type: Object as PropType<THREE.Texture | null>, default: null },
    flipbook: { type: Object as PropType<FlipbookConfig | null>, default: null },
    rotation: {
      type: null as unknown as PropType<Rotation3DInput>,
      default: () => [0, 0],
    },
    rotationSpeed: {
      type: null as unknown as PropType<Rotation3DInput>,
      default: () => [0, 0],
    },
    rotationSpeedCurve: { type: null as unknown as PropType<unknown[] | null>, default: null },
    geometry: {
      type: Object as PropType<THREE.BufferGeometry | null>,
      default: null,
    },
    orientToDirection: { type: Boolean, default: false },
    orientAxis: { type: String, default: 'z' },
    stretchBySpeed: {
      type: Object as PropType<StretchConfig | null>,
      default: null,
    },
    lighting: {
      type: null as unknown as PropType<string | number>,
      default: Lighting.STANDARD,
    },
    shadow: { type: Boolean, default: false },
    blending: {
      type: null as unknown as PropType<string | number>,
      default: Blending.NORMAL,
    },
    intensity: { type: Number, default: 1 },
    position: {
      type: null as unknown as PropType<[number, number, number]>,
      default: () => [0, 0, 0],
    },
    autoStart: { type: Boolean, default: true },
    delay: { type: Number, default: 0 },
    backdropNode: { type: null as unknown as PropType<unknown>, default: null },
    opacityNode: { type: null as unknown as PropType<unknown>, default: null },
    colorNode: { type: null as unknown as PropType<unknown>, default: null },
    alphaTestNode: { type: null as unknown as PropType<unknown>, default: null },
    castShadowNode: { type: null as unknown as PropType<unknown>, default: null },
    emitCount: { type: Number, default: 1 },
    emitterShape: {
      type: null as unknown as PropType<string | number>,
      default: EmitterShape.BOX,
    },
    emitterRadius: {
      type: null as unknown as PropType<[number, number]>,
      default: () => [0, 1],
    },
    emitterAngle: { type: Number, default: Math.PI / 4 },
    emitterHeight: {
      type: null as unknown as PropType<[number, number]>,
      default: () => [0, 1],
    },
    emitterSurfaceOnly: { type: Boolean, default: false },
    emitterDirection: {
      type: null as unknown as PropType<[number, number, number]>,
      default: () => [0, 1, 0],
    },
    turbulence: {
      type: Object as PropType<TurbulenceConfig | null>,
      default: null,
    },
    attractors: {
      type: null as unknown as PropType<AttractorConfig[] | null>,
      default: null,
    },
    attractToCenter: { type: Boolean, default: false },
    startPositionAsDirection: { type: Boolean, default: false },
    softParticles: { type: Boolean, default: false },
    softDistance: { type: Number, default: 0.5 },
    collision: {
      type: Object as PropType<CollisionConfig | null>,
      default: null,
    },
    curveTexturePath: { type: null as unknown as PropType<string | null>, default: null },
    depthTest: { type: Boolean, default: true },
    renderOrder: { type: Number, default: 0 },
  },
  setup(props, { expose, slots }) {
    const { renderer: rendererCtx } = useTresContext()
    const { onBeforeRender } = useLoop()

    const systemRef = shallowRef<VFXParticleSystem | null>(null)
    const renderObjectRef = shallowRef<THREE.Object3D | null>(null)
    const emitting = ref(props.autoStart)
    const isWebGPU = ref(false)
    const debugValuesRef = ref<Record<string, unknown> | null>(null)

    // Track structural props for recreation
    const activeMaxParticles = ref(props.maxParticles)
    const activeLighting = ref<string | number>(props.lighting)
    const activeAppearance = ref<string | number>(props.appearance)
    const activeOrientToDirection = ref(props.orientToDirection)
    const activeGeometry = shallowRef(props.geometry)
    const activeShadow = ref(props.shadow)
    const activeFadeSizeCurve = shallowRef(props.fadeSizeCurve)
    const activeFadeOpacityCurve = shallowRef(props.fadeOpacityCurve)
    const activeVelocityCurve = shallowRef(props.velocityCurve)
    const activeRotationSpeedCurve = shallowRef(props.rotationSpeedCurve)
    const activeTurbulence = ref(
      props.turbulence !== null && (props.turbulence?.intensity ?? 0) > 0
    )
    const activeAttractors = ref(
      props.attractors !== null && (props.attractors?.length ?? 0) > 0
    )
    const activeCollision = ref(props.collision !== null)
    const activeNeedsPerParticleColor = ref(
      props.colorStart.length > 1 || props.colorEnd !== null
    )
    const activeNeedsRotation = ref(
      isNonDefaultRotation(props.rotation) ||
        isNonDefaultRotation(props.rotationSpeed)
    )

    // Debug panel refs
    const prevGeometryTypeRef = ref<unknown>(null)
    const prevGeometryArgsRef = ref<unknown>(null)

    function buildOptions(): VFXParticleSystemOptions {
      const dbg = props.debug ? debugValuesRef.value : null
      return {
        maxParticles: activeMaxParticles.value as number,
        size: (dbg?.size ?? props.size) as VFXParticleSystemOptions['size'],
        colorStart: (dbg?.colorStart ?? props.colorStart) as string[],
        colorEnd:
          dbg?.colorEnd !== undefined
            ? (dbg.colorEnd as string[] | null)
            : props.colorEnd,
        fadeSize: (dbg?.fadeSize ?? props.fadeSize) as [number, number],
        fadeSizeCurve: activeFadeSizeCurve.value as VFXParticleSystemOptions['fadeSizeCurve'],
        fadeOpacity: (dbg?.fadeOpacity ?? props.fadeOpacity) as [number, number],
        fadeOpacityCurve: activeFadeOpacityCurve.value as VFXParticleSystemOptions['fadeOpacityCurve'],
        velocityCurve: activeVelocityCurve.value as VFXParticleSystemOptions['velocityCurve'],
        gravity: (dbg?.gravity ?? props.gravity) as [number, number, number],
        lifetime: (dbg?.lifetime ?? props.lifetime) as [number, number],
        direction: (dbg?.direction ?? props.direction) as VFXParticleSystemOptions['direction'],
        startPosition: (dbg?.startPosition ?? props.startPosition) as VFXParticleSystemOptions['startPosition'],
        speed: (dbg?.speed ?? props.speed) as VFXParticleSystemOptions['speed'],
        friction: (dbg?.friction ?? props.friction) as FrictionConfig,
        appearance: activeAppearance.value as VFXParticleSystemOptions['appearance'],
        alphaMap: props.alphaMap,
        flipbook: props.flipbook,
        rotation: (dbg?.rotation ?? props.rotation) as Rotation3DInput,
        rotationSpeed: (dbg?.rotationSpeed ?? props.rotationSpeed) as Rotation3DInput,
        rotationSpeedCurve: activeRotationSpeedCurve.value as VFXParticleSystemOptions['rotationSpeedCurve'],
        geometry: activeGeometry.value,
        orientToDirection: activeOrientToDirection.value as boolean,
        orientAxis: (dbg?.orientAxis ?? props.orientAxis) as string,
        stretchBySpeed: (dbg?.stretchBySpeed ?? props.stretchBySpeed) as StretchConfig | null,
        lighting: activeLighting.value as VFXParticleSystemOptions['lighting'],
        shadow: activeShadow.value as boolean,
        blending: (dbg?.blending ?? props.blending) as VFXParticleSystemOptions['blending'],
        intensity: (dbg?.intensity ?? props.intensity) as number,
        position: (dbg?.position ?? props.position) as [number, number, number],
        autoStart: (dbg?.autoStart ?? props.autoStart) as boolean,
        delay: (dbg?.delay ?? props.delay) as number,
        emitCount: (dbg?.emitCount ?? props.emitCount) as number,
        emitterShape: (dbg?.emitterShape ?? props.emitterShape) as VFXParticleSystemOptions['emitterShape'],
        emitterRadius: (dbg?.emitterRadius ?? props.emitterRadius) as [number, number],
        emitterAngle: (dbg?.emitterAngle ?? props.emitterAngle) as number,
        emitterHeight: (dbg?.emitterHeight ?? props.emitterHeight) as [number, number],
        emitterSurfaceOnly: (dbg?.emitterSurfaceOnly ?? props.emitterSurfaceOnly) as boolean,
        emitterDirection: (dbg?.emitterDirection ?? props.emitterDirection) as [number, number, number],
        turbulence: (dbg?.turbulence ?? props.turbulence) as TurbulenceConfig | null,
        attractors: (dbg?.attractors ?? props.attractors) as AttractorConfig[] | null,
        attractToCenter: (dbg?.attractToCenter ?? props.attractToCenter) as boolean,
        startPositionAsDirection: (dbg?.startPositionAsDirection ?? props.startPositionAsDirection) as boolean,
        softParticles: (dbg?.softParticles ?? props.softParticles) as boolean,
        softDistance: (dbg?.softDistance ?? props.softDistance) as number,
        collision: (dbg?.collision ?? props.collision) as CollisionConfig | null,
        backdropNode: props.backdropNode as VFXParticleSystemOptions['backdropNode'],
        opacityNode: props.opacityNode as VFXParticleSystemOptions['opacityNode'],
        colorNode: props.colorNode as VFXParticleSystemOptions['colorNode'],
        alphaTestNode: props.alphaTestNode as VFXParticleSystemOptions['alphaTestNode'],
        castShadowNode: props.castShadowNode as VFXParticleSystemOptions['castShadowNode'],
        depthTest: (dbg?.depthTest ?? props.depthTest) as boolean,
        renderOrder: (dbg?.renderOrder ?? props.renderOrder) as number,
        curveTexturePath: props.curveTexturePath,
      }
    }

    function createSystem() {
      const renderer = rendererCtx.instance as unknown as THREE.WebGPURenderer
      if (!renderer) return null

      const system = new VFXParticleSystem(renderer, buildOptions())
      return system
    }

    function destroySystem() {
      const system = systemRef.value
      if (!system) return

      // Unregister from store
      if (props.name) {
        coreStore.getState().unregisterParticles(props.name)
      }

      system.dispose()
      systemRef.value = null
      renderObjectRef.value = null
    }

    function initSystem() {
      // Don't dispose the old system during recreation — GPU compute shaders
      // may still be in-flight and would reference destroyed buffers.
      // Just mark it as not-initialized so the frame loop stops using it,
      // unregister from the store, and let GC reclaim GPU resources.
      // Full disposal only happens on unmount (destroySystem).
      const oldSystem = systemRef.value
      if (oldSystem) {
        oldSystem.initialized = false
        if (props.name) {
          coreStore.getState().unregisterParticles(props.name)
        }
      }
      systemRef.value = null
      renderObjectRef.value = null

      const renderer = rendererCtx.instance
      if (!renderer) {
        console.warn('tres-vfx: No renderer instance available')
        return
      }

      if (!isWebGPUBackend(renderer)) {
        if (!warnedWebGL) {
          warnedWebGL = true
          console.warn(
            'tres-vfx: WebGPU backend not detected. Particle system disabled.'
          )
        }
        isWebGPU.value = false
        return
      }

      isWebGPU.value = true
      const system = createSystem()
      if (!system) return

      systemRef.value = system
      // Setting renderObjectRef triggers a re-render, which adds <primitive> to the scene
      renderObjectRef.value = system.renderObject

      system.init()

      // Register with store
      if (props.name) {
        coreStore.getState().registerParticles(props.name, {
          spawn: (x = 0, y = 0, z = 0, count = 20, overrides = null) => {
            const [px, py, pz] = system.position
            system.spawn(px + x, py + y, pz + z, count, overrides)
          },
          start: () => {
            system.start()
            emitting.value = true
          },
          stop: () => {
            system.stop()
            emitting.value = false
          },
          get isEmitting() {
            return emitting.value
          },
          clear: () => system.clear(),
          uniforms: system.uniforms,
        })
      }

      // Initialize debug panel
      if (props.debug) {
        initDebugPanel()
      }
    }

    // Debug panel support
    function handleDebugUpdate(newValues: Record<string, unknown>) {
      debugValuesRef.value = { ...debugValuesRef.value, ...newValues }
      const system = systemRef.value
      if (!system) return

      // Handle colorStart→colorEnd fallback
      if ('colorStart' in newValues && newValues.colorStart) {
        const currentColorEnd = debugValuesRef.value?.colorEnd
        if (!currentColorEnd) {
          newValues = { ...newValues, colorEnd: null }
        }
      }
      if ('colorEnd' in newValues && !newValues.colorEnd) {
        newValues = {
          ...newValues,
          colorEnd: null,
          colorStart:
            newValues.colorStart ??
            debugValuesRef.value?.colorStart ?? ['#ffffff'],
        }
      }

      updateUniformsPartial(system.uniforms, newValues)

      // Curve changes → trigger recreation
      if ('fadeSizeCurve' in newValues) {
        activeFadeSizeCurve.value = newValues.fadeSizeCurve as unknown[] | null
      }
      if ('fadeOpacityCurve' in newValues) {
        activeFadeOpacityCurve.value = newValues.fadeOpacityCurve as unknown[] | null
      }
      if ('velocityCurve' in newValues) {
        activeVelocityCurve.value = newValues.velocityCurve as unknown[] | null
      }
      if ('rotationSpeedCurve' in newValues) {
        activeRotationSpeedCurve.value = newValues.rotationSpeedCurve as unknown[] | null
      }

      if ('turbulence' in newValues) {
        system.setTurbulenceSpeed(
          (newValues.turbulence as TurbulenceConfig | null)?.speed ?? 1
        )
      }

      // Feature flags
      const newFeatures = resolveFeatures(
        debugValuesRef.value as Record<string, unknown>
      )
      if (newFeatures.needsRotation !== activeNeedsRotation.value) {
        activeNeedsRotation.value = newFeatures.needsRotation
      }
      if (
        newFeatures.needsPerParticleColor !== activeNeedsPerParticleColor.value
      ) {
        activeNeedsPerParticleColor.value = newFeatures.needsPerParticleColor
      }
      if (newFeatures.turbulence !== activeTurbulence.value) {
        activeTurbulence.value = newFeatures.turbulence
      }
      if (newFeatures.attractors !== activeAttractors.value) {
        activeAttractors.value = newFeatures.attractors
      }
      if (newFeatures.collision !== activeCollision.value) {
        activeCollision.value = newFeatures.collision
      }

      if (newValues.position) {
        system.setPosition(newValues.position as [number, number, number])
      }

      if ('delay' in newValues) system.setDelay((newValues.delay as number) ?? 0)
      if ('emitCount' in newValues)
        system.setEmitCount((newValues.emitCount as number) ?? 1)

      if (newValues.autoStart !== undefined) {
        emitting.value = newValues.autoStart as boolean
      }

      if (system.material && newValues.blending !== undefined) {
        ;(system.material as any).blending = newValues.blending
        ;(system.material as any).needsUpdate = true
      }

      // Remount-required values
      if (
        newValues.maxParticles !== undefined &&
        newValues.maxParticles !== activeMaxParticles.value
      ) {
        activeMaxParticles.value = newValues.maxParticles as number
        system.initialized = false
        system.nextIndex = 0
      }
      if (
        newValues.lighting !== undefined &&
        newValues.lighting !== activeLighting.value
      ) {
        activeLighting.value = newValues.lighting as string | number
      }
      if (
        newValues.appearance !== undefined &&
        newValues.appearance !== activeAppearance.value
      ) {
        activeAppearance.value = newValues.appearance as string | number
      }
      if (
        newValues.orientToDirection !== undefined &&
        newValues.orientToDirection !== activeOrientToDirection.value
      ) {
        activeOrientToDirection.value = newValues.orientToDirection as boolean
      }
      if (
        newValues.shadow !== undefined &&
        newValues.shadow !== activeShadow.value
      ) {
        activeShadow.value = newValues.shadow as boolean
      }

      // Geometry type changes
      if ('geometryType' in newValues || 'geometryArgs' in newValues) {
        const geoType =
          newValues.geometryType ?? prevGeometryTypeRef.value
        const geoArgs =
          newValues.geometryArgs ?? prevGeometryArgsRef.value
        const geoTypeChanged =
          'geometryType' in newValues &&
          geoType !== prevGeometryTypeRef.value
        const geoArgsChanged =
          'geometryArgs' in newValues &&
          JSON.stringify(geoArgs) !==
            JSON.stringify(prevGeometryArgsRef.value)

        if (geoTypeChanged || geoArgsChanged) {
          prevGeometryTypeRef.value = geoType
          prevGeometryArgsRef.value = geoArgs

          import('debug-vfx').then((mod) => {
            const { createGeometry, GeometryType } = mod
            if (geoType === GeometryType.NONE || !geoType) {
              if (activeGeometry.value !== null && !props.geometry) {
                activeGeometry.value.dispose()
              }
              activeGeometry.value = null
            } else {
              const newGeometry = createGeometry(geoType as string, geoArgs as Record<string, number> | undefined)
              if (newGeometry) {
                if (
                  activeGeometry.value !== null &&
                  activeGeometry.value !== props.geometry
                ) {
                  activeGeometry.value.dispose()
                }
                activeGeometry.value = newGeometry
              }
            }
          })
        }
      }
    }

    function initDebugPanel() {
      import('debug-vfx').then((mod) => {
        const { renderDebugPanel, detectGeometryTypeAndArgs } = mod

        // On recreation, preserve accumulated debug values (e.g. added colors)
        // so the panel doesn't reset. Only build from props on first mount.
        if (!debugValuesRef.value) {
          const initialValues: Record<string, unknown> = {
            name: props.name,
            maxParticles: props.maxParticles,
            size: props.size,
            colorStart: props.colorStart,
            colorEnd: props.colorEnd,
            fadeSize: props.fadeSize,
            fadeSizeCurve: props.fadeSizeCurve || null,
            fadeOpacity: props.fadeOpacity,
            fadeOpacityCurve: props.fadeOpacityCurve || null,
            velocityCurve: props.velocityCurve || null,
            gravity: props.gravity,
            lifetime: props.lifetime,
            direction: props.direction,
            startPosition: props.startPosition,
            startPositionAsDirection: props.startPositionAsDirection,
            speed: props.speed,
            friction: props.friction,
            appearance: props.appearance,
            rotation: props.rotation,
            rotationSpeed: props.rotationSpeed,
            rotationSpeedCurve: props.rotationSpeedCurve || null,
            orientToDirection: props.orientToDirection,
            orientAxis: props.orientAxis,
            stretchBySpeed: props.stretchBySpeed || null,
            lighting: props.lighting,
            shadow: props.shadow,
            blending: props.blending,
            intensity: props.intensity,
            position: props.position,
            autoStart: props.autoStart,
            delay: props.delay,
            emitCount: props.emitCount,
            emitterShape: props.emitterShape,
            emitterRadius: props.emitterRadius,
            emitterAngle: props.emitterAngle,
            emitterHeight: props.emitterHeight,
            emitterSurfaceOnly: props.emitterSurfaceOnly,
            emitterDirection: props.emitterDirection,
            turbulence: props.turbulence,
            attractToCenter: props.attractToCenter,
            softParticles: props.softParticles,
            softDistance: props.softDistance,
            collision: props.collision,
            ...detectGeometryTypeAndArgs(props.geometry),
          }

          debugValuesRef.value = initialValues
          prevGeometryTypeRef.value = initialValues.geometryType
          prevGeometryArgsRef.value = initialValues.geometryArgs
        }

        renderDebugPanel(debugValuesRef.value, handleDebugUpdate, 'tres')
      })
    }

    // Watch structural props for recreation (skip in debug mode)
    watch(
      () => [
        props.maxParticles,
        props.lighting,
        props.appearance,
        props.orientToDirection,
        props.geometry,
        props.shadow,
        props.fadeSizeCurve,
        props.fadeOpacityCurve,
        props.velocityCurve,
        props.rotationSpeedCurve,
        props.colorStart.length,
        props.colorEnd,
        props.rotation,
        props.rotationSpeed,
        props.turbulence,
        props.attractors,
        props.collision,
      ],
      () => {
        if (props.debug) return

        activeMaxParticles.value = props.maxParticles
        activeLighting.value = props.lighting
        activeAppearance.value = props.appearance
        activeOrientToDirection.value = props.orientToDirection
        activeGeometry.value = props.geometry
        activeShadow.value = props.shadow
        activeFadeSizeCurve.value = props.fadeSizeCurve
        activeFadeOpacityCurve.value = props.fadeOpacityCurve
        activeVelocityCurve.value = props.velocityCurve
        activeRotationSpeedCurve.value = props.rotationSpeedCurve
        activeNeedsPerParticleColor.value =
          props.colorStart.length > 1 || props.colorEnd !== null
        activeNeedsRotation.value =
          isNonDefaultRotation(props.rotation) ||
          isNonDefaultRotation(props.rotationSpeed)
        activeTurbulence.value =
          props.turbulence !== null && (props.turbulence?.intensity ?? 0) > 0
        activeAttractors.value =
          props.attractors !== null && (props.attractors?.length ?? 0) > 0
        activeCollision.value = props.collision !== null
      }
    )

    // Watch structural active values for system recreation
    watch(
      [
        activeMaxParticles,
        activeLighting,
        activeAppearance,
        activeOrientToDirection,
        activeGeometry,
        activeShadow,
        activeNeedsPerParticleColor,
        activeNeedsRotation,
        activeTurbulence,
        activeAttractors,
        activeCollision,
        activeFadeSizeCurve,
        activeFadeOpacityCurve,
        activeVelocityCurve,
        activeRotationSpeedCurve,
      ],
      () => {
        if (!isWebGPU.value) return
        initSystem()
      }
    )

    // Watch non-structural props for uniform updates (skip in debug mode)
    watch(
      () => [
        props.position,
        props.size,
        props.fadeSize,
        props.fadeOpacity,
        props.gravity,
        props.friction,
        props.speed,
        props.lifetime,
        props.direction,
        props.rotation,
        props.rotationSpeed,
        props.intensity,
        props.colorStart,
        props.colorEnd,
        props.collision,
        props.emitterShape,
        props.emitterRadius,
        props.emitterAngle,
        props.emitterHeight,
        props.emitterSurfaceOnly,
        props.emitterDirection,
        props.turbulence,
        props.startPosition,
        props.attractors,
        props.attractToCenter,
        props.startPositionAsDirection,
        props.softParticles,
        props.softDistance,
        props.orientAxis,
        props.stretchBySpeed,
        props.delay,
        props.emitCount,
      ],
      () => {
        if (props.debug) return
        const system = systemRef.value
        if (!system) return

        system.setPosition(props.position as [number, number, number])
        system.setDelay(props.delay)
        system.setEmitCount(props.emitCount)
        system.setTurbulenceSpeed(props.turbulence?.speed ?? 1)

        const normalized = normalizeProps({
          size: props.size,
          speed: props.speed,
          fadeSize: props.fadeSize,
          fadeOpacity: props.fadeOpacity,
          lifetime: props.lifetime,
          gravity: props.gravity,
          direction: props.direction,
          startPosition: props.startPosition,
          rotation: props.rotation,
          rotationSpeed: props.rotationSpeed,
          friction: props.friction,
          intensity: props.intensity,
          colorStart: props.colorStart,
          colorEnd: props.colorEnd,
          emitterShape: props.emitterShape,
          emitterRadius: props.emitterRadius,
          emitterAngle: props.emitterAngle,
          emitterHeight: props.emitterHeight,
          emitterSurfaceOnly: props.emitterSurfaceOnly,
          emitterDirection: props.emitterDirection,
          turbulence: props.turbulence,
          attractors: props.attractors,
          attractToCenter: props.attractToCenter,
          startPositionAsDirection: props.startPositionAsDirection,
          softParticles: props.softParticles,
          softDistance: props.softDistance,
          collision: props.collision,
          orientAxis: props.orientAxis,
          stretchBySpeed: props.stretchBySpeed,
        } as any)
        updateUniforms(system.uniforms, normalized)
      },
      { deep: true }
    )

    // Frame loop
    onBeforeRender(({ delta }) => {
      const system = systemRef.value
      if (!system || !system.initialized) return

      system.update(delta)

      if (emitting.value) {
        system.autoEmit(delta)
      }
    })

    onMounted(() => {
      // Cast needed: isInitialized/onReady exist at runtime but tsup DTS doesn't resolve them
      const mgr = rendererCtx as any
      if (mgr.isInitialized?.value) {
        initSystem()
      } else if (mgr.onReady) {
        mgr.onReady(() => {
          initSystem()
        })
      } else {
        // Fallback: try immediately
        initSystem()
      }
    })

    onUnmounted(() => {
      if (props.debug) {
        import('debug-vfx').then((mod) => {
          mod.destroyDebugPanel()
        })
      }
      destroySystem()
    })

    // Expose public API
    const api = {
      spawn: (
        x = 0,
        y = 0,
        z = 0,
        count = 20,
        overrides: Record<string, unknown> | null = null
      ) => {
        const system = systemRef.value
        if (!system) return
        const [px, py, pz] = system.position
        system.spawn(px + x, py + y, pz + z, count, overrides)
      },
      start: () => {
        const system = systemRef.value
        if (!system) return
        system.start()
        emitting.value = true
      },
      stop: () => {
        const system = systemRef.value
        if (!system) return
        system.stop()
        emitting.value = false
      },
      clear: () => {
        systemRef.value?.clear()
      },
      get isEmitting() {
        return emitting.value
      },
      get uniforms() {
        return systemRef.value?.uniforms ?? null
      },
    }

    expose(api)

    return () => {
      if (!isWebGPU.value) {
        return slots.fallback ? slots.fallback() : null
      }

      const obj = renderObjectRef.value
      if (!obj) return null

      return h('primitive', { object: obj })
    }
  },
})

export type VFXParticlesProps = InstanceType<typeof VFXParticles>['$props']
