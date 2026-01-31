import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
} from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useVFXStore } from './react-store'
import { useCurveTextureAsync } from './useCurveTextureAsync'
import {
  Appearance,
  Blending,
  EmitterShape,
  Lighting,
  VFXParticleSystem,
  isNonDefaultRotation,
  normalizeProps,
  updateUniforms,
  updateUniformsPartial,
  updateUniformsCurveFlags,
  resolveFeatures,
  type VFXParticleSystemOptions,
} from 'core-vfx'

// Re-export constants and utilities for backwards compatibility
export {
  Appearance,
  Blending,
  EmitterShape,
  AttractorType,
  Easing,
  Lighting,
  bakeCurveToArray,
  createCombinedCurveTexture,
  buildCurveTextureBin,
  CurveChannel,
} from 'core-vfx'

export type { CurveTextureResult } from 'core-vfx'

export type VFXParticlesProps = VFXParticleSystemOptions & {
  /** Optional name for registering with useVFXStore (enables VFXEmitter linking) */
  name?: string
  /** Show debug control panel */
  debug?: boolean
}

export const VFXParticles = forwardRef<unknown, VFXParticlesProps>(
  function VFXParticles(
    {
      name,
      maxParticles = 10000,
      size = [0.1, 0.3],
      colorStart = ['#ffffff'],
      colorEnd = null,
      fadeSize = [1, 0],
      fadeSizeCurve = null,
      fadeOpacity = [1, 0],
      fadeOpacityCurve = null,
      velocityCurve = null,
      gravity = [0, 0, 0],
      lifetime = [1, 2],
      direction = [
        [-1, 1],
        [0, 1],
        [-1, 1],
      ],
      startPosition = [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      speed = [0.1, 0.1],
      friction = { intensity: 0, easing: 'linear' },
      appearance = Appearance.GRADIENT,
      alphaMap = null,
      flipbook = null,
      rotation = [0, 0],
      rotationSpeed = [0, 0],
      rotationSpeedCurve = null,
      geometry = null,
      orientToDirection = false,
      orientAxis = 'z',
      stretchBySpeed = null,
      lighting = Lighting.STANDARD,
      shadow = false,
      blending = Blending.NORMAL,
      intensity = 1,
      position = [0, 0, 0],
      autoStart = true,
      delay = 0,
      backdropNode = null,
      opacityNode = null,
      colorNode = null,
      alphaTestNode = null,
      castShadowNode = null,
      emitCount = 1,
      emitterShape = EmitterShape.BOX,
      emitterRadius = [0, 1],
      emitterAngle = Math.PI / 4,
      emitterHeight = [0, 1],
      emitterSurfaceOnly = false,
      emitterDirection = [0, 1, 0],
      turbulence = null,
      attractors = null,
      attractToCenter = false,
      startPositionAsDirection = false,
      softParticles = false,
      softDistance = 0.5,
      collision = null,
      debug = false,
      curveTexturePath = null,
      depthTest = true,
      renderOrder = 0,
    },
    ref
  ) {
    const { gl: renderer } = useThree()
    const spriteRef = useRef<THREE.Sprite | THREE.InstancedMesh | null>(null)
    const [emitting, setEmitting] = useState(autoStart)

    // State for "remount-required" values - changing these recreates GPU resources
    const [activeMaxParticles, setActiveMaxParticles] = useState(maxParticles)
    const [activeLighting, setActiveLighting] = useState(lighting)
    const [activeAppearance, setActiveAppearance] = useState(appearance)
    const [activeOrientToDirection, setActiveOrientToDirection] =
      useState(orientToDirection)
    const [activeGeometry, setActiveGeometry] = useState(geometry)
    const [activeShadow, setActiveShadow] = useState(shadow)
    const [activeFadeSizeCurve, setActiveFadeSizeCurve] =
      useState(fadeSizeCurve)
    const [activeFadeOpacityCurve, setActiveFadeOpacityCurve] =
      useState(fadeOpacityCurve)
    const [activeVelocityCurve, setActiveVelocityCurve] =
      useState(velocityCurve)
    const [activeRotationSpeedCurve, setActiveRotationSpeedCurve] =
      useState(rotationSpeedCurve)
    const [activeTurbulence, setActiveTurbulence] = useState(
      turbulence !== null && (turbulence?.intensity ?? 0) > 0
    )
    const [activeAttractors, setActiveAttractors] = useState(
      attractors !== null && attractors.length > 0
    )
    const [activeCollision, setActiveCollision] = useState(collision !== null)
    const [activeNeedsPerParticleColor, setActiveNeedsPerParticleColor] =
      useState(colorStart.length > 1 || colorEnd !== null)
    const [activeNeedsRotation, setActiveNeedsRotation] = useState(
      isNonDefaultRotation(rotation) || isNonDefaultRotation(rotationSpeed)
    )

    // Keep remount-required state in sync with props (when not in debug mode)
    useEffect(() => {
      if (!debug) {
        setActiveMaxParticles(maxParticles)
        setActiveLighting(lighting)
        setActiveAppearance(appearance)
        setActiveOrientToDirection(orientToDirection)
        setActiveGeometry(geometry)
        setActiveShadow(shadow)
        setActiveFadeSizeCurve(fadeSizeCurve)
        setActiveFadeOpacityCurve(fadeOpacityCurve)
        setActiveVelocityCurve(velocityCurve)
        setActiveRotationSpeedCurve(rotationSpeedCurve)
        setActiveNeedsPerParticleColor(
          colorStart.length > 1 || colorEnd !== null
        )
        setActiveNeedsRotation(
          isNonDefaultRotation(rotation) || isNonDefaultRotation(rotationSpeed)
        )
        setActiveTurbulence(
          turbulence !== null && (turbulence?.intensity ?? 0) > 0
        )
        setActiveAttractors(attractors !== null && attractors.length > 0)
        setActiveCollision(collision !== null)
      }
    }, [
      debug,
      maxParticles,
      lighting,
      appearance,
      orientToDirection,
      geometry,
      colorStart.length,
      colorEnd,
      shadow,
      fadeSizeCurve,
      fadeOpacityCurve,
      velocityCurve,
      rotationSpeedCurve,
      rotation,
      rotationSpeed,
      turbulence,
      attractors,
      collision,
    ])

    // Curve texture (React-specific hook)
    const {
      texture: curveTexture,
      sizeEnabled: curveTextureSizeEnabled,
      opacityEnabled: curveTextureOpacityEnabled,
      velocityEnabled: curveTextureVelocityEnabled,
      rotationSpeedEnabled: curveTextureRotationSpeedEnabled,
    } = useCurveTextureAsync(
      activeFadeSizeCurve,
      activeFadeOpacityCurve,
      activeVelocityCurve,
      activeRotationSpeedCurve,
      curveTexturePath
    )

    // Create/recreate system when structural props change
    const system = useMemo(
      () =>
        new VFXParticleSystem(
          renderer as unknown as THREE.WebGPURenderer,
          {
            maxParticles: activeMaxParticles,
            size,
            colorStart,
            colorEnd,
            fadeSize,
            fadeSizeCurve: activeFadeSizeCurve,
            fadeOpacity,
            fadeOpacityCurve: activeFadeOpacityCurve,
            velocityCurve: activeVelocityCurve,
            gravity,
            lifetime,
            direction,
            startPosition,
            speed,
            friction,
            appearance: activeAppearance,
            alphaMap,
            flipbook,
            rotation,
            rotationSpeed,
            rotationSpeedCurve: activeRotationSpeedCurve,
            geometry: activeGeometry,
            orientToDirection: activeOrientToDirection,
            orientAxis,
            stretchBySpeed,
            lighting: activeLighting,
            shadow: activeShadow,
            blending,
            intensity,
            position,
            autoStart,
            delay,
            emitCount,
            emitterShape,
            emitterRadius,
            emitterAngle,
            emitterHeight,
            emitterSurfaceOnly,
            emitterDirection,
            turbulence,
            attractors,
            attractToCenter,
            startPositionAsDirection,
            softParticles,
            softDistance,
            collision,
            backdropNode,
            opacityNode,
            colorNode,
            alphaTestNode,
            castShadowNode,
            depthTest,
            renderOrder,
          },
          curveTexture,
          {
            sizeEnabled: curveTextureSizeEnabled,
            opacityEnabled: curveTextureOpacityEnabled,
            velocityEnabled: curveTextureVelocityEnabled,
            rotationSpeedEnabled: curveTextureRotationSpeedEnabled,
          }
        ),
      // Only recreate when structural props change (features, maxParticles, etc.)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        renderer,
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
        curveTexture,
        alphaMap,
        flipbook,
        blending,
        backdropNode,
        opacityNode,
        colorNode,
        alphaTestNode,
        castShadowNode,
        softParticles,
      ]
    )

    // Initialize on mount
    useEffect(() => {
      system.init()
    }, [system])

    // Update uniforms when non-structural props change (skip in debug mode)
    useEffect(() => {
      if (debug) return

      system.setPosition(position)
      system.setDelay(delay)
      system.setEmitCount(emitCount)
      system.setTurbulenceSpeed(turbulence?.speed ?? 1)

      const normalized = normalizeProps({
        size,
        speed,
        fadeSize,
        fadeOpacity,
        lifetime,
        gravity,
        direction,
        startPosition,
        rotation,
        rotationSpeed,
        friction,
        intensity,
        colorStart,
        colorEnd,
        emitterShape,
        emitterRadius,
        emitterAngle,
        emitterHeight,
        emitterSurfaceOnly,
        emitterDirection,
        turbulence,
        attractors,
        attractToCenter,
        startPositionAsDirection,
        softParticles,
        softDistance,
        collision,
        orientAxis,
        stretchBySpeed,
      })
      updateUniforms(system.uniforms, normalized)
      updateUniformsCurveFlags(system.uniforms, {
        fadeSizeCurveEnabled: curveTextureSizeEnabled,
        fadeOpacityCurveEnabled: curveTextureOpacityEnabled,
        velocityCurveEnabled: curveTextureVelocityEnabled,
        rotationSpeedCurveEnabled: curveTextureRotationSpeedEnabled,
      })
    }, [
      debug,
      system,
      position,
      size,
      fadeSize,
      fadeOpacity,
      gravity,
      friction,
      speed,
      lifetime,
      direction,
      rotation,
      rotationSpeed,
      intensity,
      colorStart,
      colorEnd,
      collision,
      emitterShape,
      emitterRadius,
      emitterAngle,
      emitterHeight,
      emitterSurfaceOnly,
      emitterDirection,
      turbulence,
      startPosition,
      attractors,
      attractToCenter,
      startPositionAsDirection,
      softParticles,
      softDistance,
      curveTextureVelocityEnabled,
      curveTextureRotationSpeedEnabled,
      curveTextureSizeEnabled,
      curveTextureOpacityEnabled,
      orientAxis,
      stretchBySpeed,
      delay,
      emitCount,
    ])

    // Public spawn - uses system position as offset, supports overrides
    const spawn = useCallback(
      (
        x = 0,
        y = 0,
        z = 0,
        count = 20,
        overrides: Record<string, unknown> | null = null
      ) => {
        const [px, py, pz] = system.position
        system.spawn(px + x, py + y, pz + z, count, overrides)
      },
      [system]
    )

    // Update each frame + auto emit
    useFrame(async (_state, delta) => {
      if (!system.initialized) return

      await system.update(delta)

      if (emitting) {
        system.autoEmit(delta)
      }
    })

    // Start/stop functions
    const start = useCallback(() => {
      system.start()
      setEmitting(true)
    }, [system])

    const stop = useCallback(() => {
      system.stop()
      setEmitting(false)
    }, [system])

    // Cleanup old material/renderObject when they change (not on unmount)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevMaterialRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevRenderObjectRef = useRef<any>(null)

    useEffect(() => {
      // Dispose previous material if it changed
      if (
        prevMaterialRef.current &&
        prevMaterialRef.current !== system.material
      ) {
        prevMaterialRef.current.dispose()
      }
      prevMaterialRef.current = system.material

      // Dispose previous renderObject if it changed
      if (
        prevRenderObjectRef.current &&
        prevRenderObjectRef.current !== system.renderObject
      ) {
        if (prevRenderObjectRef.current.material) {
          prevRenderObjectRef.current.material.dispose()
        }
      }
      prevRenderObjectRef.current = system.renderObject
    }, [system.material, system.renderObject])

    // Cleanup on actual unmount only
    useEffect(() => {
      return () => {
        system.dispose()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Expose methods via ref
    const particleAPI = useMemo(
      () => ({
        spawn,
        start,
        stop,
        get isEmitting() {
          return emitting
        },
        clear() {
          system.clear()
        },
        uniforms: system.uniforms,
      }),
      [spawn, start, stop, emitting, system]
    )

    useImperativeHandle(ref, () => particleAPI, [particleAPI])

    // Register with VFX store when name prop is provided
    const registerParticles = useVFXStore((s) => s.registerParticles)
    const unregisterParticles = useVFXStore((s) => s.unregisterParticles)

    useEffect(() => {
      if (!name) return

      registerParticles(name, particleAPI)

      return () => {
        unregisterParticles(name)
      }
    }, [name, particleAPI, registerParticles, unregisterParticles])

    // Debug panel - no React state, direct ref mutation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debugValuesRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevGeometryTypeRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevGeometryArgsRef = useRef<any>(null)

    // Imperative update function called by debug panel
    const handleDebugUpdate = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (newValues: any) => {
        // Merge new values into existing (dirty tracking only sends changed keys)
        debugValuesRef.current = { ...debugValuesRef.current, ...newValues }

        // Handle colorStart→colorEnd fallback before calling core
        // When colorStart changes and colorEnd is null, sync colorEnd uniforms
        if ('colorStart' in newValues && newValues.colorStart) {
          const currentColorEnd = debugValuesRef.current?.colorEnd
          if (!currentColorEnd) {
            // Pass colorStart as colorEnd so updateUniformsPartial handles both
            newValues = {
              ...newValues,
              colorEnd: null,
            }
          }
        }
        // For colorEnd, resolve fallback to colorStart
        if ('colorEnd' in newValues && !newValues.colorEnd) {
          newValues = {
            ...newValues,
            colorEnd: null,
            // Ensure updateUniformsPartial gets the right fallback
            colorStart: newValues.colorStart ??
              debugValuesRef.current?.colorStart ?? ['#ffffff'],
          }
        }

        // Update all uniform values via core function
        updateUniformsPartial(system.uniforms, newValues)

        // React state: curves (trigger recreation)
        if ('fadeSizeCurve' in newValues) {
          setActiveFadeSizeCurve(newValues.fadeSizeCurve)
        }
        if ('fadeOpacityCurve' in newValues) {
          setActiveFadeOpacityCurve(newValues.fadeOpacityCurve)
        }
        if ('velocityCurve' in newValues) {
          setActiveVelocityCurve(newValues.velocityCurve)
        }
        if ('rotationSpeedCurve' in newValues) {
          setActiveRotationSpeedCurve(newValues.rotationSpeedCurve)
        }

        // Update turbulence speed on system
        if ('turbulence' in newValues) {
          system.setTurbulenceSpeed(newValues.turbulence?.speed ?? 1)
        }

        // React state: feature flags that trigger recreation
        const newFeatures = resolveFeatures(debugValuesRef.current)
        if (newFeatures.needsRotation !== activeNeedsRotation) {
          setActiveNeedsRotation(newFeatures.needsRotation)
        }
        if (newFeatures.needsPerParticleColor !== activeNeedsPerParticleColor) {
          setActiveNeedsPerParticleColor(newFeatures.needsPerParticleColor)
        }
        if (newFeatures.turbulence !== activeTurbulence) {
          setActiveTurbulence(newFeatures.turbulence)
        }
        if (newFeatures.attractors !== activeAttractors) {
          setActiveAttractors(newFeatures.attractors)
        }
        if (newFeatures.collision !== activeCollision) {
          setActiveCollision(newFeatures.collision)
        }

        // Position update
        if (newValues.position) {
          system.setPosition(newValues.position)
        }

        // Runtime updates
        if ('delay' in newValues) system.setDelay(newValues.delay ?? 0)
        if ('emitCount' in newValues)
          system.setEmitCount(newValues.emitCount ?? 1)

        // Update emitting state
        if (newValues.autoStart !== undefined) {
          setEmitting(newValues.autoStart)
        }

        // Update material blending directly
        if (system.material && newValues.blending !== undefined) {
          system.material.blending = newValues.blending
          system.material.needsUpdate = true
        }

        // Remount-required values
        if (
          newValues.maxParticles !== undefined &&
          newValues.maxParticles !== activeMaxParticles
        ) {
          setActiveMaxParticles(newValues.maxParticles)
          system.initialized = false
          system.nextIndex = 0
        }
        if (
          newValues.lighting !== undefined &&
          newValues.lighting !== activeLighting
        ) {
          setActiveLighting(newValues.lighting)
        }
        if (
          newValues.appearance !== undefined &&
          newValues.appearance !== activeAppearance
        ) {
          setActiveAppearance(newValues.appearance)
        }
        if (
          newValues.orientToDirection !== undefined &&
          newValues.orientToDirection !== activeOrientToDirection
        ) {
          setActiveOrientToDirection(newValues.orientToDirection)
        }
        if (
          newValues.shadow !== undefined &&
          newValues.shadow !== activeShadow
        ) {
          setActiveShadow(newValues.shadow)
        }

        // Handle geometry type and args changes
        if ('geometryType' in newValues || 'geometryArgs' in newValues) {
          const geoType = newValues.geometryType ?? prevGeometryTypeRef.current
          const geoArgs = newValues.geometryArgs ?? prevGeometryArgsRef.current
          const geoTypeChanged =
            'geometryType' in newValues &&
            geoType !== prevGeometryTypeRef.current
          const geoArgsChanged =
            'geometryArgs' in newValues &&
            JSON.stringify(geoArgs) !==
              JSON.stringify(prevGeometryArgsRef.current)

          if (geoTypeChanged || geoArgsChanged) {
            prevGeometryTypeRef.current = geoType
            prevGeometryArgsRef.current = geoArgs

            import('debug-vfx').then(({ createGeometry, GeometryType }) => {
              if (geoType === GeometryType.NONE || !geoType) {
                if (activeGeometry !== null && !geometry) {
                  activeGeometry.dispose()
                }
                setActiveGeometry(null)
              } else {
                const newGeometry = createGeometry(geoType, geoArgs)
                if (newGeometry) {
                  if (activeGeometry !== null && activeGeometry !== geometry) {
                    activeGeometry.dispose()
                  }
                  setActiveGeometry(newGeometry)
                }
              }
            })
          }
        }
      },
      [
        system,
        activeMaxParticles,
        activeLighting,
        activeAppearance,
        activeOrientToDirection,
        activeShadow,
        activeGeometry,
        activeNeedsPerParticleColor,
        activeNeedsRotation,
        activeTurbulence,
        activeAttractors,
        activeCollision,
        geometry,
      ]
    )

    // Initialize debug panel once on mount if debug is enabled
    useEffect(() => {
      if (!debug) return

      import('debug-vfx').then(
        ({ renderDebugPanel, detectGeometryTypeAndArgs }) => {
          const initialValues = {
            name,
            maxParticles,
            size,
            colorStart,
            colorEnd,
            fadeSize,
            fadeSizeCurve: fadeSizeCurve || null,
            fadeOpacity,
            fadeOpacityCurve: fadeOpacityCurve || null,
            velocityCurve: velocityCurve || null,
            gravity,
            lifetime,
            direction,
            startPosition,
            startPositionAsDirection,
            speed,
            friction,
            appearance,
            rotation,
            rotationSpeed,
            rotationSpeedCurve: rotationSpeedCurve || null,
            orientToDirection,
            orientAxis,
            stretchBySpeed: stretchBySpeed || null,
            lighting,
            shadow,
            blending,
            intensity,
            position,
            autoStart,
            delay,
            emitCount,
            emitterShape,
            emitterRadius,
            emitterAngle,
            emitterHeight,
            emitterSurfaceOnly,
            emitterDirection,
            turbulence,
            attractToCenter,
            softParticles,
            softDistance,
            collision,
            ...detectGeometryTypeAndArgs(geometry),
          }

          debugValuesRef.current = initialValues
          prevGeometryTypeRef.current = initialValues.geometryType
          prevGeometryArgsRef.current = initialValues.geometryArgs

          renderDebugPanel(initialValues, handleDebugUpdate)
        }
      )

      return () => {
        import('debug-vfx').then(({ destroyDebugPanel }) => {
          destroyDebugPanel()
        })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debug, geometry])

    // Update debug panel callback when handleDebugUpdate changes
    useEffect(() => {
      if (!debug) return
      import('debug-vfx').then(({ updateDebugPanel }) => {
        if (debugValuesRef.current) {
          updateDebugPanel({ ...debugValuesRef.current }, handleDebugUpdate)
        }
      })
    }, [debug, handleDebugUpdate])

    // @ts-expect-error
    return <primitive ref={spriteRef} object={system.renderObject} />
  }
)
