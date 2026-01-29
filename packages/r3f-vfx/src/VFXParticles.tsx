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
import { uniform, instancedArray } from 'three/tsl'
import {
  Appearance,
  Blending,
  EmitterShape,
  AttractorType,
  Easing,
  Lighting,
  MAX_ATTRACTORS,
  hexToRgb,
  toRange,
  easingToType,
  axisToNumber,
  toRotation3D,
  lifetimeToFadeRate,
  createCombinedCurveTexture,
  createInitCompute,
  createSpawnCompute,
  createUpdateCompute,
  createParticleMaterial,
  type CurveData,
  type Rotation3DInput,
  type ParticleData,
  type ParticleStorageArrays,
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
} from 'core-vfx'

export type VFXParticlesProps = {
  /** Optional name for registering with useVFXStore (enables VFXEmitter linking) */
  name?: string
  /** Maximum number of particles */
  maxParticles?: number
  /** Particle size [min, max] or single value */
  size?: number | [number, number]
  /** Array of hex color strings for start color */
  colorStart?: string[]
  /** Array of hex color strings for end color (null = use colorStart) */
  colorEnd?: string[] | null
  /** Fade size [start, end] multiplier over lifetime */
  fadeSize?: number | [number, number]
  /** Curve data for size over lifetime */
  fadeSizeCurve?: CurveData
  /** Fade opacity [start, end] multiplier over lifetime */
  fadeOpacity?: number | [number, number]
  /** Curve data for opacity over lifetime */
  fadeOpacityCurve?: CurveData
  /** Curve data for velocity over lifetime */
  velocityCurve?: CurveData
  /** Gravity vector [x, y, z] */
  gravity?: [number, number, number]
  /** Particle lifetime in seconds [min, max] or single value */
  lifetime?: number | [number, number]
  /** Direction ranges for velocity */
  direction?: Rotation3DInput
  /** Start position offset ranges */
  startPosition?: Rotation3DInput
  /** Speed [min, max] or single value */
  speed?: number | [number, number]
  /** Friction settings */
  friction?: { intensity?: number | [number, number]; easing?: string }
  /** Particle appearance type */
  appearance?: (typeof Appearance)[keyof typeof Appearance]
  /** Alpha map texture */
  alphaMap?: THREE.Texture | null
  /** Flipbook animation settings */
  flipbook?: { rows: number; columns: number } | null
  /** Rotation [min, max] in radians or 3D rotation ranges */
  rotation?: Rotation3DInput
  /** Rotation speed [min, max] in radians/second or 3D ranges */
  rotationSpeed?: Rotation3DInput
  /** Curve data for rotation speed over lifetime */
  rotationSpeedCurve?: CurveData
  /** Custom geometry for 3D particles */
  geometry?: THREE.BufferGeometry | null
  /** Rotate geometry to face velocity direction */
  orientToDirection?: boolean
  /** Which local axis aligns with velocity */
  orientAxis?: string
  /** Stretch particles based on speed */
  stretchBySpeed?: { factor: number; maxStretch: number } | null
  /** Material lighting type for geometry mode */
  lighting?: (typeof Lighting)[keyof typeof Lighting]
  /** Enable shadows on geometry instances */
  shadow?: boolean
  /** Blending mode */
  blending?: THREE.Blending
  /** Color intensity multiplier */
  intensity?: number
  /** Emitter position [x, y, z] */
  position?: [number, number, number]
  /** Start emitting automatically */
  autoStart?: boolean
  /** Delay between emissions in seconds */
  delay?: number
  /** TSL node or function for backdrop sampling */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backdropNode?: any | ((data: ParticleData) => any) | null
  /** TSL node or function for custom opacity */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opacityNode?: any | ((data: ParticleData) => any) | null
  /** TSL node or function to override color */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colorNode?: any | ((data: ParticleData, defaultColor: any) => any) | null
  /** TSL node or function for alpha test/discard */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alphaTestNode?: any | ((data: ParticleData) => any) | null
  /** TSL node or function for shadow map output */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  castShadowNode?: any | ((data: ParticleData) => any) | null
  /** Number of particles to emit per frame */
  emitCount?: number
  /** Emitter shape type */
  emitterShape?: (typeof EmitterShape)[keyof typeof EmitterShape]
  /** Emitter radius [inner, outer] */
  emitterRadius?: number | [number, number]
  /** Cone angle in radians */
  emitterAngle?: number
  /** Cone height [min, max] */
  emitterHeight?: number | [number, number]
  /** Emit from surface only */
  emitterSurfaceOnly?: boolean
  /** Direction for cone/disk normal */
  emitterDirection?: [number, number, number]
  /** Turbulence settings */
  turbulence?: { intensity: number; frequency?: number; speed?: number } | null
  /** Array of attractors (max 4) */
  attractors?: Array<{
    position?: [number, number, number]
    strength?: number
    radius?: number
    type?: 'point' | 'vortex'
    axis?: [number, number, number]
  }> | null
  /** Particles move from spawn position to center over lifetime */
  attractToCenter?: boolean
  /** Use start position offset as direction */
  startPositionAsDirection?: boolean
  /** Fade particles when intersecting scene geometry */
  softParticles?: boolean
  /** Distance over which to fade soft particles */
  softDistance?: number
  /** Plane collision settings */
  collision?: {
    plane?: { y: number }
    bounce?: number
    friction?: number
    die?: boolean
    sizeBasedGravity?: number
  } | null
  /** Show debug control panel */
  debug?: boolean
  /** Path to pre-baked curve texture (skips runtime baking for faster load) */
  curveTexturePath?: string | null
  /** Depth test */
  depthTest?: boolean
  /** Render order (higher values render on top) */
  renderOrder?: number
}

export const VFXParticles = forwardRef<unknown, VFXParticlesProps>(
  function VFXParticles(
    {
      name, // Optional name for registering with useVFXStore (enables VFXEmitter linking)
      maxParticles = 10000,
      size = [0.1, 0.3],
      colorStart = ['#ffffff'],
      colorEnd = null, // If null, uses colorStart (no color transition)
      fadeSize = [1, 0],
      fadeSizeCurve = null, // Curve data { points: [...] } - controls fadeSize over lifetime (overrides fadeSize if set)
      fadeOpacity = [1, 0],
      fadeOpacityCurve = null, // Curve data { points: [...] } - controls fadeOpacity over lifetime (overrides fadeOpacity if set)
      velocityCurve = null, // Curve data { points: [...] } - controls velocity/speed over lifetime (overrides friction if set)
      gravity = [0, 0, 0],
      lifetime = [1, 2],
      direction = [
        [-1, 1],
        [0, 1],
        [-1, 1],
      ], // [[minX, maxX], [minY, maxY], [minZ, maxZ]] or [min, max] for all axes
      startPosition = [
        [0, 0],
        [0, 0],
        [0, 0],
      ], // [[minX, maxX], [minY, maxY], [minZ, maxZ]] offset from spawn position
      speed = [0.1, 0.1],
      friction = { intensity: 0, easing: 'linear' }, // { intensity: [start, end] or single value, easing: string }
      // intensity: 1 = max friction (almost stopped), 0 = no friction (normal), negative = boost/acceleration
      appearance = Appearance.GRADIENT,
      alphaMap = null,
      flipbook = null, // { rows: 4, columns: 8 }
      rotation = [0, 0], // [min, max] in radians
      rotationSpeed = [0, 0], // [min, max] rotation speed in radians/second
      rotationSpeedCurve = null, // Curve data { points: [...] } - controls rotation speed over lifetime
      geometry = null, // Custom geometry (e.g. new THREE.SphereGeometry(0.5, 8, 8))
      orientToDirection = false, // Rotate geometry to face velocity direction (geometry mode only)
      orientAxis = 'z', // Which local axis aligns with velocity: "x", "y", "z", "-x", "-y", "-z"
      stretchBySpeed = null, // { factor: 2, maxStretch: 5 } - stretch particles in velocity direction based on effective speed
      lighting = Lighting.STANDARD, // 'basic' | 'standard' | 'physical' - material type for geometry mode
      shadow = false, // Enable both castShadow and receiveShadow on geometry instances
      blending = Blending.NORMAL,
      intensity = 1,
      position = [0, 0, 0],
      autoStart = true,
      delay = 0,
      backdropNode = null, // TSL node or function for backdrop sampling
      opacityNode = null, // TSL node or function for custom opacity control
      colorNode = null, // TSL node or function to override color (receives particleData, should return vec4)
      alphaTestNode = null, // TSL node or function for custom alpha test/discard (return true to discard fragment)
      castShadowNode = null, // TSL node or function for shadow map output (what shadow the particle casts)
      emitCount = 1,
      // Emitter shape props
      emitterShape = EmitterShape.BOX, // Emission shape type
      emitterRadius = [0, 1], // [inner, outer] radius for sphere/cone/disk (inner=0 for solid)
      emitterAngle = Math.PI / 4, // Cone angle in radians (0 = line, PI/2 = hemisphere)
      emitterHeight = [0, 1], // [min, max] height for cone
      emitterSurfaceOnly = false, // Emit from surface only (sphere/disk)
      emitterDirection = [0, 1, 0], // Direction for cone/disk normal
      // Turbulence (curl noise)
      turbulence = null, // { intensity: 0.5, frequency: 1, speed: 1 }
      // Attractors - array of up to 4 attractors
      // { position: [x,y,z], strength: 1, radius: 3, type: 'point'|'vortex', axis?: [x,y,z] }
      attractors = null,
      // Simple attract to center - particles move from spawn position to center over lifetime
      // Overrides speed/direction - lifetime controls how long it takes to reach center
      attractToCenter = false,
      // Use start position offset as direction - particles move in the direction of their spawn offset
      startPositionAsDirection = false,
      // Soft particles - fade when intersecting scene geometry
      softParticles = false,
      softDistance = 0.5, // Distance in world units over which to fade
      // Plane collision - particles bounce or die when hitting a plane
      // { plane: { y: 0 }, bounce: 0.3, friction: 0.8, die: false, sizeBasedGravity: 0 }
      collision = null,
      // Debug mode - shows tweakable control panel
      debug = false,
      // Path to pre-baked curve texture (skips runtime baking for faster load)
      curveTexturePath = null,
      // Depth test
      depthTest = true,
      // Render order
      renderOrder = 0,
    },
    ref
  ) {
    const { gl: renderer } = useThree()
    const spriteRef = useRef<THREE.Sprite | THREE.InstancedMesh | null>(null)
    const initialized = useRef(false)
    const nextIndex = useRef(0)
    const [emitting, setEmitting] = useState(autoStart)
    const emitAccumulator = useRef(0)

    // Refs for runtime values that can be updated by debug panel
    const delayRef = useRef(delay)
    const emitCountRef = useRef(emitCount)
    const turbulenceRef = useRef(turbulence)

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
    // Shader features that require recompilation when toggled (e.g. from debug panel)
    const [activeTurbulence, setActiveTurbulence] = useState(
      turbulence !== null && (turbulence?.intensity ?? 0) > 0
    )
    const [activeAttractors, setActiveAttractors] = useState(
      attractors !== null && attractors.length > 0
    )
    const [activeCollision, setActiveCollision] = useState(collision !== null)
    // Per-particle color arrays needed if: multiple start colors OR color transition
    const [activeNeedsPerParticleColor, setActiveNeedsPerParticleColor] =
      useState(colorStart.length > 1 || colorEnd !== null)
    // Rotation array needed if rotation or rotationSpeed is non-default
    // Default rotation = [0,0] or [[0,0],[0,0],[0,0]], default rotationSpeed = [0,0] or [[0,0],[0,0],[0,0]]
    const isNonDefaultRotation = (r: Rotation3DInput) => {
      if (typeof r === 'number') return r !== 0
      if (Array.isArray(r) && r.length === 2 && typeof r[0] === 'number') {
        return r[0] !== 0 || r[1] !== 0
      }
      // 3D format [[minX, maxX], [minY, maxY], [minZ, maxZ]]
      if (Array.isArray(r)) {
        return r.some(
          (axis) => Array.isArray(axis) && (axis[0] !== 0 || axis[1] !== 0)
        )
      }
      return false
    }
    const [activeNeedsRotation, setActiveNeedsRotation] = useState(
      isNonDefaultRotation(rotation) || isNonDefaultRotation(rotationSpeed)
    )

    // Keep refs in sync with props (when not in debug mode)
    useEffect(() => {
      delayRef.current = delay
      emitCountRef.current = emitCount
      turbulenceRef.current = turbulence
    }, [delay, emitCount, turbulence])

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

    // Normalize props to [min, max] ranges
    const sizeRange = useMemo(() => toRange(size, [0.1, 0.3]), [size])
    const speedRange = useMemo(() => toRange(speed, [0.1, 0.1]), [speed])
    const fadeSizeRange = useMemo(() => toRange(fadeSize, [1, 0]), [fadeSize])
    const fadeOpacityRange = useMemo(
      () => toRange(fadeOpacity, [1, 0]),
      [fadeOpacity]
    )

    // Create combined curve texture for GPU sampling (use active curves for debug mode)
    // R = size, G = opacity, B = velocity, A = rotation speed
    // If curveTexturePath is provided, loads pre-baked texture (instant)
    // Otherwise, bakes curves in web worker (slower but flexible)
    const curveTexture = useCurveTextureAsync(
      activeFadeSizeCurve,
      activeFadeOpacityCurve,
      activeVelocityCurve,
      activeRotationSpeedCurve,
      curveTexturePath
    )

    // Note: curveTexture is managed by useCurveTextureAsync hook, no manual disposal needed here
    const prevCurveTextureRef = useRef<THREE.DataTexture | null>(null)
    useEffect(() => {
      prevCurveTextureRef.current = curveTexture

      return () => {
        if (curveTexture) {
          curveTexture.dispose()
        }
      }
    }, [curveTexture])
    const lifetimeRange = useMemo(() => toRange(lifetime, [1, 2]), [lifetime])
    const rotation3D = useMemo(() => toRotation3D(rotation), [rotation])
    const rotationSpeed3D = useMemo(
      () => toRotation3D(rotationSpeed),
      [rotationSpeed]
    )
    const direction3D = useMemo(() => toRotation3D(direction), [direction])
    const startPosition3D = useMemo(
      () => toRotation3D(startPosition),
      [startPosition]
    )
    const emitterRadiusRange = useMemo(
      () => toRange(emitterRadius, [0, 1]),
      [emitterRadius]
    )
    const emitterHeightRange = useMemo(
      () => toRange(emitterHeight, [0, 1]),
      [emitterHeight]
    )

    // Determine which features are active (affects storage arrays and shader generation)
    // Uses state so debug panel can trigger storage array recreation
    const activeFeatures = useMemo(
      () => ({
        // Storage array features
        needsPerParticleColor: activeNeedsPerParticleColor,
        needsRotation: activeNeedsRotation,
        // Shader features (skip code entirely when disabled)
        turbulence: activeTurbulence,
        attractors: activeAttractors,
        collision: activeCollision,
        rotation: activeNeedsRotation,
        perParticleColor: activeNeedsPerParticleColor,
      }),
      [
        activeNeedsPerParticleColor,
        activeNeedsRotation,
        activeTurbulence,
        activeAttractors,
        activeCollision,
      ]
    )

    // Parse friction object: { intensity: [start, end] or single value, easing: string }
    const frictionIntensityRange = useMemo(() => {
      if (
        typeof friction === 'object' &&
        friction !== null &&
        'intensity' in friction
      ) {
        return toRange(friction.intensity, [0, 0])
      }
      return [0, 0] // Default: no friction
    }, [friction])
    const frictionEasingType = useMemo(() => {
      if (
        typeof friction === 'object' &&
        friction !== null &&
        'easing' in friction
      ) {
        return easingToType(friction.easing ?? 'linear')
      }
      return 0 // linear
    }, [friction])

    // Convert color arrays to RGB (support up to 8 colors each)
    const startColors = useMemo(() => {
      const colors = colorStart.slice(0, 8).map(hexToRgb)
      while (colors.length < 8)
        colors.push(colors[colors.length - 1] || [1, 1, 1])
      return colors
    }, [colorStart])

    // Use colorStart if colorEnd is not provided (no color transition)
    const effectiveColorEnd = colorEnd ?? colorStart

    const endColors = useMemo(() => {
      const colors = effectiveColorEnd.slice(0, 8).map(hexToRgb)
      while (colors.length < 8)
        colors.push(colors[colors.length - 1] || [1, 1, 1])
      return colors
    }, [effectiveColorEnd])

    // Uniforms
    const uniforms = useMemo(
      () => ({
        sizeMin: uniform(sizeRange[0]),
        sizeMax: uniform(sizeRange[1]),
        fadeSizeStart: uniform(fadeSizeRange[0]),
        fadeSizeEnd: uniform(fadeSizeRange[1]),
        fadeOpacityStart: uniform(fadeOpacityRange[0]),
        fadeOpacityEnd: uniform(fadeOpacityRange[1]),
        gravity: uniform(new THREE.Vector3(...gravity)),
        frictionIntensityStart: uniform(frictionIntensityRange[0]),
        frictionIntensityEnd: uniform(frictionIntensityRange[1]),
        frictionEasingType: uniform(frictionEasingType),
        speedMin: uniform(speedRange[0]),
        speedMax: uniform(speedRange[1]),
        lifetimeMin: uniform(lifetimeToFadeRate(lifetimeRange[1])),
        lifetimeMax: uniform(lifetimeToFadeRate(lifetimeRange[0])),
        deltaTime: uniform(0.016), // Will be updated each frame
        // 3D direction ranges
        dirMinX: uniform(direction3D[0][0]),
        dirMaxX: uniform(direction3D[0][1]),
        dirMinY: uniform(direction3D[1][0]),
        dirMaxY: uniform(direction3D[1][1]),
        dirMinZ: uniform(direction3D[2][0]),
        dirMaxZ: uniform(direction3D[2][1]),
        // 3D start position offset ranges
        startPosMinX: uniform(startPosition3D[0][0]),
        startPosMaxX: uniform(startPosition3D[0][1]),
        startPosMinY: uniform(startPosition3D[1][0]),
        startPosMaxY: uniform(startPosition3D[1][1]),
        startPosMinZ: uniform(startPosition3D[2][0]),
        startPosMaxZ: uniform(startPosition3D[2][1]),
        spawnPosition: uniform(new THREE.Vector3(...position)),
        spawnIndexStart: uniform(0),
        spawnIndexEnd: uniform(0),
        spawnSeed: uniform(0),
        intensity: uniform(intensity),
        // 3D rotation ranges
        rotationMinX: uniform(rotation3D[0][0]),
        rotationMaxX: uniform(rotation3D[0][1]),
        rotationMinY: uniform(rotation3D[1][0]),
        rotationMaxY: uniform(rotation3D[1][1]),
        rotationMinZ: uniform(rotation3D[2][0]),
        rotationMaxZ: uniform(rotation3D[2][1]),
        // 3D rotation speed ranges (radians/second)
        rotationSpeedMinX: uniform(rotationSpeed3D[0][0]),
        rotationSpeedMaxX: uniform(rotationSpeed3D[0][1]),
        rotationSpeedMinY: uniform(rotationSpeed3D[1][0]),
        rotationSpeedMaxY: uniform(rotationSpeed3D[1][1]),
        rotationSpeedMinZ: uniform(rotationSpeed3D[2][0]),
        rotationSpeedMaxZ: uniform(rotationSpeed3D[2][1]),
        // Color arrays (8 colors max each)
        colorStartCount: uniform(colorStart.length),
        colorEndCount: uniform(effectiveColorEnd.length),
        colorStart0: uniform(new THREE.Color(...startColors[0])),
        colorStart1: uniform(new THREE.Color(...startColors[1])),
        colorStart2: uniform(new THREE.Color(...startColors[2])),
        colorStart3: uniform(new THREE.Color(...startColors[3])),
        colorStart4: uniform(new THREE.Color(...startColors[4])),
        colorStart5: uniform(new THREE.Color(...startColors[5])),
        colorStart6: uniform(new THREE.Color(...startColors[6])),
        colorStart7: uniform(new THREE.Color(...startColors[7])),
        colorEnd0: uniform(new THREE.Color(...endColors[0])),
        colorEnd1: uniform(new THREE.Color(...endColors[1])),
        colorEnd2: uniform(new THREE.Color(...endColors[2])),
        colorEnd3: uniform(new THREE.Color(...endColors[3])),
        colorEnd4: uniform(new THREE.Color(...endColors[4])),
        colorEnd5: uniform(new THREE.Color(...endColors[5])),
        colorEnd6: uniform(new THREE.Color(...endColors[6])),
        colorEnd7: uniform(new THREE.Color(...endColors[7])),
        // Emitter shape uniforms
        emitterShapeType: uniform(emitterShape),
        emitterRadiusInner: uniform(emitterRadiusRange[0]),
        emitterRadiusOuter: uniform(emitterRadiusRange[1]),
        emitterAngle: uniform(emitterAngle),
        emitterHeightMin: uniform(emitterHeightRange[0]),
        emitterHeightMax: uniform(emitterHeightRange[1]),
        emitterSurfaceOnly: uniform(emitterSurfaceOnly ? 1 : 0),
        emitterDir: uniform(new THREE.Vector3(...emitterDirection).normalize()),
        // Turbulence uniforms
        turbulenceIntensity: uniform(turbulence?.intensity ?? 0),
        turbulenceFrequency: uniform(turbulence?.frequency ?? 1),
        turbulenceSpeed: uniform(turbulence?.speed ?? 1),
        turbulenceTime: uniform(0), // Updated each frame
        // Attractor uniforms (up to 4)
        attractorCount: uniform(0),
        attractor0Pos: uniform(new THREE.Vector3(0, 0, 0)),
        attractor0Strength: uniform(0),
        attractor0Radius: uniform(1),
        attractor0Type: uniform(0),
        attractor0Axis: uniform(new THREE.Vector3(0, 1, 0)),
        attractor1Pos: uniform(new THREE.Vector3(0, 0, 0)),
        attractor1Strength: uniform(0),
        attractor1Radius: uniform(1),
        attractor1Type: uniform(0),
        attractor1Axis: uniform(new THREE.Vector3(0, 1, 0)),
        attractor2Pos: uniform(new THREE.Vector3(0, 0, 0)),
        attractor2Strength: uniform(0),
        attractor2Radius: uniform(1),
        attractor2Type: uniform(0),
        attractor2Axis: uniform(new THREE.Vector3(0, 1, 0)),
        attractor3Pos: uniform(new THREE.Vector3(0, 0, 0)),
        attractor3Strength: uniform(0),
        attractor3Radius: uniform(1),
        attractor3Type: uniform(0),
        attractor3Axis: uniform(new THREE.Vector3(0, 1, 0)),
        // Simple attract to center
        attractToCenter: uniform(attractToCenter ? 1 : 0),
        // Use start position as direction
        startPositionAsDirection: uniform(startPositionAsDirection ? 1 : 0),
        // Soft particles
        softParticlesEnabled: uniform(softParticles ? 1 : 0),
        softDistance: uniform(softDistance),
        // Velocity curve (replaces friction when enabled)
        // Enable if velocityCurve prop is set OR curveTexturePath is provided
        velocityCurveEnabled: uniform(
          velocityCurve || curveTexturePath ? 1 : 0
        ),
        // Rotation speed curve (modulates rotation speed over lifetime)
        rotationSpeedCurveEnabled: uniform(
          rotationSpeedCurve || curveTexturePath ? 1 : 0
        ),
        // Fade size curve (when disabled, uses fadeSize prop interpolation)
        fadeSizeCurveEnabled: uniform(
          fadeSizeCurve || curveTexturePath ? 1 : 0
        ),
        // Fade opacity curve (when disabled, uses fadeOpacity prop interpolation)
        fadeOpacityCurveEnabled: uniform(
          fadeOpacityCurve || curveTexturePath ? 1 : 0
        ),
        // Orient axis: 0=+X, 1=+Y, 2=+Z, 3=-X, 4=-Y, 5=-Z
        orientAxisType: uniform(axisToNumber(orientAxis)),
        // Stretch by speed (uses effective velocity after curve modifier)
        stretchEnabled: uniform(stretchBySpeed ? 1 : 0),
        stretchFactor: uniform(stretchBySpeed?.factor ?? 1),
        stretchMax: uniform(stretchBySpeed?.maxStretch ?? 5),
        // Collision uniforms
        collisionEnabled: uniform(collision ? 1 : 0),
        collisionPlaneY: uniform(collision?.plane?.y ?? 0),
        collisionBounce: uniform(collision?.bounce ?? 0.3),
        collisionFriction: uniform(collision?.friction ?? 0.8),
        collisionDie: uniform(collision?.die ? 1 : 0),
        // Size-based gravity (inside collision object)
        sizeBasedGravity: uniform(collision?.sizeBasedGravity ?? 0),
      }),
      []
    )

    // Store position prop for use in spawn
    const positionRef = useRef(position)

    // Update all uniforms when props change (skip in debug mode - debug panel handles this)
    useEffect(() => {
      // In debug mode, the debug panel controls uniform values via handleDebugUpdate
      // Skip this effect to avoid overwriting user changes from the panel
      if (debug) return

      positionRef.current = position

      // Size
      uniforms.sizeMin.value = sizeRange[0]
      uniforms.sizeMax.value = sizeRange[1]

      // Fade
      uniforms.fadeSizeStart.value = fadeSizeRange[0]
      uniforms.fadeSizeEnd.value = fadeSizeRange[1]
      uniforms.fadeOpacityStart.value = fadeOpacityRange[0]
      uniforms.fadeOpacityEnd.value = fadeOpacityRange[1]

      // Physics
      uniforms.gravity.value.set(...gravity)
      uniforms.frictionIntensityStart.value = frictionIntensityRange[0]
      uniforms.frictionIntensityEnd.value = frictionIntensityRange[1]
      uniforms.frictionEasingType.value = frictionEasingType
      uniforms.speedMin.value = speedRange[0]
      uniforms.speedMax.value = speedRange[1]

      // Lifetime
      uniforms.lifetimeMin.value = lifetimeToFadeRate(lifetimeRange[1])
      uniforms.lifetimeMax.value = lifetimeToFadeRate(lifetimeRange[0])

      // Direction
      // 3D Direction
      uniforms.dirMinX.value = direction3D[0][0]
      uniforms.dirMaxX.value = direction3D[0][1]
      uniforms.dirMinY.value = direction3D[1][0]
      uniforms.dirMaxY.value = direction3D[1][1]
      uniforms.dirMinZ.value = direction3D[2][0]
      uniforms.dirMaxZ.value = direction3D[2][1]

      // Start position offset
      // 3D Start Position
      uniforms.startPosMinX.value = startPosition3D[0][0]
      uniforms.startPosMaxX.value = startPosition3D[0][1]
      uniforms.startPosMinY.value = startPosition3D[1][0]
      uniforms.startPosMaxY.value = startPosition3D[1][1]
      uniforms.startPosMinZ.value = startPosition3D[2][0]
      uniforms.startPosMaxZ.value = startPosition3D[2][1]

      // 3D Rotation
      uniforms.rotationMinX.value = rotation3D[0][0]
      uniforms.rotationMaxX.value = rotation3D[0][1]
      uniforms.rotationMinY.value = rotation3D[1][0]
      uniforms.rotationMaxY.value = rotation3D[1][1]
      uniforms.rotationMinZ.value = rotation3D[2][0]
      uniforms.rotationMaxZ.value = rotation3D[2][1]

      // 3D Rotation Speed
      uniforms.rotationSpeedMinX.value = rotationSpeed3D[0][0]
      uniforms.rotationSpeedMaxX.value = rotationSpeed3D[0][1]
      uniforms.rotationSpeedMinY.value = rotationSpeed3D[1][0]
      uniforms.rotationSpeedMaxY.value = rotationSpeed3D[1][1]
      uniforms.rotationSpeedMinZ.value = rotationSpeed3D[2][0]
      uniforms.rotationSpeedMaxZ.value = rotationSpeed3D[2][1]

      // Intensity
      uniforms.intensity.value = intensity

      // Colors
      uniforms.colorStartCount.value = colorStart.length
      uniforms.colorEndCount.value = effectiveColorEnd.length
      startColors.forEach((c: [number, number, number], i: number) => {
        ;(uniforms as unknown as Record<string, { value: THREE.Color }>)[
          `colorStart${i}`
        ]?.value.setRGB(...c)
      })
      endColors.forEach((c: [number, number, number], i: number) => {
        ;(uniforms as unknown as Record<string, { value: THREE.Color }>)[
          `colorEnd${i}`
        ]?.value.setRGB(...c)
      })

      // Emitter shape
      uniforms.emitterShapeType.value = emitterShape
      uniforms.emitterRadiusInner.value = emitterRadiusRange[0]
      uniforms.emitterRadiusOuter.value = emitterRadiusRange[1]
      uniforms.emitterAngle.value = emitterAngle
      uniforms.emitterHeightMin.value = emitterHeightRange[0]
      uniforms.emitterHeightMax.value = emitterHeightRange[1]
      uniforms.emitterSurfaceOnly.value = emitterSurfaceOnly ? 1 : 0
      uniforms.emitterDir.value.set(...emitterDirection).normalize()

      // Turbulence
      uniforms.turbulenceIntensity.value = turbulence?.intensity ?? 0
      uniforms.turbulenceFrequency.value = turbulence?.frequency ?? 1
      uniforms.turbulenceSpeed.value = turbulence?.speed ?? 1

      // Attractors
      const attractorList = attractors ?? []
      uniforms.attractorCount.value = Math.min(
        attractorList.length,
        MAX_ATTRACTORS
      )
      for (let i = 0; i < MAX_ATTRACTORS; i++) {
        const a = attractorList[i]
        // @ts-expect-error - Dynamic uniform indexing
        const u = uniforms as Record<string, { value: THREE.Vector3 | number }>
        if (a) {
          ;(u[`attractor${i}Pos`].value as THREE.Vector3).set(
            ...(a.position ?? [0, 0, 0])
          )
          u[`attractor${i}Strength`].value = a.strength ?? 1
          u[`attractor${i}Radius`].value = a.radius ?? 0 // 0 = infinite
          u[`attractor${i}Type`].value = a.type === 'vortex' ? 1 : 0
          ;(u[`attractor${i}Axis`].value as THREE.Vector3)
            .set(...(a.axis ?? [0, 1, 0]))
            .normalize()
        } else {
          u[`attractor${i}Strength`].value = 0
        }
      }

      // Simple attract to center
      uniforms.attractToCenter.value = attractToCenter ? 1 : 0

      // Start position as direction
      uniforms.startPositionAsDirection.value = startPositionAsDirection ? 1 : 0

      // Soft particles
      uniforms.softParticlesEnabled.value = softParticles ? 1 : 0
      uniforms.softDistance.value = softDistance

      // Velocity curve (when enabled, overrides friction)
      // Enable if velocityCurve prop is set OR curveTexturePath is provided
      uniforms.velocityCurveEnabled.value =
        velocityCurve || curveTexturePath ? 1 : 0

      // Rotation speed curve
      uniforms.rotationSpeedCurveEnabled.value =
        rotationSpeedCurve || curveTexturePath ? 1 : 0

      // Fade size curve (when enabled, uses curve instead of fadeSize prop)
      uniforms.fadeSizeCurveEnabled.value =
        fadeSizeCurve || curveTexturePath ? 1 : 0

      // Fade opacity curve (when enabled, uses curve instead of fadeOpacity prop)
      uniforms.fadeOpacityCurveEnabled.value =
        fadeOpacityCurve || curveTexturePath ? 1 : 0

      // Orient axis
      uniforms.orientAxisType.value = axisToNumber(orientAxis)

      // Stretch by speed
      uniforms.stretchEnabled.value = stretchBySpeed ? 1 : 0
      uniforms.stretchFactor.value = stretchBySpeed?.factor ?? 1
      uniforms.stretchMax.value = stretchBySpeed?.maxStretch ?? 5

      // Collision
      uniforms.collisionEnabled.value = collision ? 1 : 0
      uniforms.collisionPlaneY.value = collision?.plane?.y ?? 0
      uniforms.collisionBounce.value = collision?.bounce ?? 0.3
      uniforms.collisionFriction.value = collision?.friction ?? 0.8
      uniforms.collisionDie.value = collision?.die ? 1 : 0
      uniforms.sizeBasedGravity.value = collision?.sizeBasedGravity ?? 0
    }, [
      debug,
      position,
      sizeRange,
      fadeSizeRange,
      fadeOpacityRange,
      gravity,
      frictionIntensityRange,
      frictionEasingType,
      speedRange,
      lifetimeRange,
      direction3D,
      rotation3D,
      rotationSpeed3D,
      intensity,
      colorStart,
      effectiveColorEnd,
      startColors,
      endColors,
      uniforms,
      collision,
      emitterShape,
      emitterRadiusRange,
      emitterAngle,
      emitterHeightRange,
      emitterSurfaceOnly,
      emitterDirection,
      turbulence,
      startPosition3D,
      attractors,
      attractToCenter,
      startPositionAsDirection,
      softParticles,
      softDistance,
      velocityCurve,
      rotationSpeedCurve,
      fadeSizeCurve,
      fadeOpacityCurve,
      curveTexturePath,
      orientAxis,
      stretchBySpeed,
    ])

    // GPU Storage arrays
    // ADDITIVE: Color arrays only created when needed (multiple colors or color transition)
    const storage: ParticleStorageArrays = useMemo(() => {
      const arrays: ParticleStorageArrays = {
        positions: instancedArray(activeMaxParticles, 'vec3'),
        velocities: instancedArray(activeMaxParticles, 'vec3'),
        lifetimes: instancedArray(activeMaxParticles, 'float'),
        fadeRates: instancedArray(activeMaxParticles, 'float'),
        particleSizes: instancedArray(activeMaxParticles, 'float'),
        // Optional arrays - null when feature unused (saves GPU memory)
        particleRotations: null,
        particleColorStarts: null,
        particleColorEnds: null,
      }

      // Only create rotation array if rotation or rotationSpeed is non-default
      if (activeFeatures.needsRotation) {
        arrays.particleRotations = instancedArray(activeMaxParticles, 'vec3')
      }

      // Only create color arrays if needed (multiple start colors or color transition)
      if (activeFeatures.needsPerParticleColor) {
        arrays.particleColorStarts = instancedArray(activeMaxParticles, 'vec3')
        arrays.particleColorEnds = instancedArray(activeMaxParticles, 'vec3')
      }

      return arrays
    }, [
      activeMaxParticles,
      activeFeatures.needsRotation,
      activeFeatures.needsPerParticleColor,
    ])

    // Initialize all particles as dead
    const computeInit = useMemo(
      () => createInitCompute(storage, activeMaxParticles),
      [storage, activeMaxParticles]
    )

    // Spawn compute shader
    const computeSpawn = useMemo(
      () => createSpawnCompute(storage, uniforms, activeMaxParticles),
      [storage, uniforms, activeMaxParticles]
    )

    // Update particles each frame (framerate independent)
    // Pass shader features to generate optimized shader (skip unused code)
    const computeUpdate = useMemo(
      () =>
        createUpdateCompute(
          storage,
          uniforms,
          curveTexture,
          activeMaxParticles,
          {
            turbulence: activeFeatures.turbulence,
            attractors: activeFeatures.attractors,
            collision: activeFeatures.collision,
            rotation: activeFeatures.rotation,
            perParticleColor: activeFeatures.perParticleColor,
          }
        ),
      [storage, uniforms, curveTexture, activeMaxParticles, activeFeatures]
    )

    // Material (either Sprite or Mesh material based on geometry prop)
    const material = useMemo(
      () =>
        createParticleMaterial(storage, uniforms, curveTexture, {
          alphaMap,
          flipbook,
          appearance: activeAppearance,
          lighting: activeLighting,
          softParticles,
          geometry: activeGeometry,
          orientToDirection: activeOrientToDirection,
          shadow: activeShadow,
          blending,
          opacityNode,
          colorNode,
          backdropNode,
          alphaTestNode,
          castShadowNode,
        }),
      [
        storage,
        uniforms,
        curveTexture,
        activeAppearance,
        alphaMap,
        flipbook,
        blending,
        activeGeometry,
        activeOrientToDirection,
        activeLighting,
        backdropNode,
        opacityNode,
        colorNode,
        alphaTestNode,
        castShadowNode,
        softParticles,
        activeShadow,
      ]
    )

    // Create sprite or instanced mesh based on geometry prop
    const renderObject = useMemo(() => {
      if (activeGeometry) {
        // InstancedMesh mode
        const mesh = new THREE.InstancedMesh(
          activeGeometry,
          material,
          activeMaxParticles
        )
        mesh.frustumCulled = false
        mesh.castShadow = activeShadow
        mesh.receiveShadow = activeShadow
        return mesh
      } else {
        // Sprite mode (default)
        // @ts-expect-error - WebGPU SpriteNodeMaterial type mismatch
        const s = new THREE.Sprite(material)
        s.count = activeMaxParticles
        s.frustumCulled = false
        return s
      }
    }, [material, activeMaxParticles, activeGeometry, activeShadow])

    // Initialize on mount
    useEffect(() => {
      if (!renderer || initialized.current) return
      // @ts-expect-error - WebGPU computeAsync not in WebGL types
      renderer.computeAsync(computeInit).then(() => {
        initialized.current = true
      })
    }, [renderer, computeInit])

    // Apply spawn overrides to uniforms, returns restore function
    const applySpawnOverrides = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (overrides: Record<string, any> | null) => {
        if (!overrides) return null

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saved: Record<string, any> = {}

        // Helper to save and set uniform value
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const setUniform = (key: string, value: any) => {
          // @ts-expect-error - Dynamic uniform access
          if (uniforms[key]) {
            // @ts-expect-error - Dynamic uniform access
            saved[key] = uniforms[key].value
            // @ts-expect-error - Dynamic uniform access
            uniforms[key].value = value
          }
        }

        // Size: number or [min, max]
        if (overrides.size !== undefined) {
          const range = toRange(overrides.size, [0.1, 0.3])
          setUniform('sizeMin', range[0])
          setUniform('sizeMax', range[1])
        }

        // Speed: number or [min, max]
        if (overrides.speed !== undefined) {
          const range = toRange(overrides.speed, [0.1, 0.1])
          setUniform('speedMin', range[0])
          setUniform('speedMax', range[1])
        }

        // Lifetime: number or [min, max]
        if (overrides.lifetime !== undefined) {
          const range = toRange(overrides.lifetime, [1, 2])
          setUniform('lifetimeMin', 1 / range[1])
          setUniform('lifetimeMax', 1 / range[0])
        }

        // Direction: [[minX, maxX], [minY, maxY], [minZ, maxZ]] or [min, max] or number
        if (overrides.direction !== undefined) {
          const dir3D = toRotation3D(overrides.direction)
          setUniform('dirMinX', dir3D[0][0])
          setUniform('dirMaxX', dir3D[0][1])
          setUniform('dirMinY', dir3D[1][0])
          setUniform('dirMaxY', dir3D[1][1])
          setUniform('dirMinZ', dir3D[2][0])
          setUniform('dirMaxZ', dir3D[2][1])
        }

        // Start position offset
        if (overrides.startPosition !== undefined) {
          const pos3D = toRotation3D(overrides.startPosition)
          setUniform('startPosMinX', pos3D[0][0])
          setUniform('startPosMaxX', pos3D[0][1])
          setUniform('startPosMinY', pos3D[1][0])
          setUniform('startPosMaxY', pos3D[1][1])
          setUniform('startPosMinZ', pos3D[2][0])
          setUniform('startPosMaxZ', pos3D[2][1])
        }

        // Gravity: [x, y, z]
        if (overrides.gravity !== undefined) {
          saved.gravity = uniforms.gravity.value.clone()
          uniforms.gravity.value.set(
            ...(overrides.gravity as [number, number, number])
          )
        }

        // Colors - requires converting hex to RGB and setting multiple uniforms
        // @ts-expect-error - Dynamic uniform access
        const u = uniforms as Record<string, { value: THREE.Color }>
        if (overrides.colorStart !== undefined) {
          const colors = overrides.colorStart.slice(0, 8).map(hexToRgb)
          while (colors.length < 8)
            colors.push(colors[colors.length - 1] || [1, 1, 1])
          setUniform('colorStartCount', overrides.colorStart.length)
          colors.forEach((c: [number, number, number], i: number) => {
            if (u[`colorStart${i}`]) {
              saved[`colorStart${i}`] = u[`colorStart${i}`].value.clone()
              u[`colorStart${i}`].value.setRGB(...c)
            }
          })
        }

        if (overrides.colorEnd !== undefined) {
          const colors = overrides.colorEnd.slice(0, 8).map(hexToRgb)
          while (colors.length < 8)
            colors.push(colors[colors.length - 1] || [1, 1, 1])
          setUniform('colorEndCount', overrides.colorEnd.length)
          colors.forEach((c: [number, number, number], i: number) => {
            if (u[`colorEnd${i}`]) {
              saved[`colorEnd${i}`] = u[`colorEnd${i}`].value.clone()
              u[`colorEnd${i}`].value.setRGB(...c)
            }
          })
        }

        // Rotation
        if (overrides.rotation !== undefined) {
          const rot3D = toRotation3D(overrides.rotation)
          setUniform('rotationMinX', rot3D[0][0])
          setUniform('rotationMaxX', rot3D[0][1])
          setUniform('rotationMinY', rot3D[1][0])
          setUniform('rotationMaxY', rot3D[1][1])
          setUniform('rotationMinZ', rot3D[2][0])
          setUniform('rotationMaxZ', rot3D[2][1])
        }

        // Return restore function
        return () => {
          Object.entries(saved).forEach(([key, value]) => {
            // @ts-expect-error - Dynamic uniform access
            if (uniforms[key]) {
              // @ts-expect-error - Dynamic uniform access
              uniforms[key].value = value
            }
          })
        }
      },
      [uniforms]
    )

    // Spawn function - internal
    const spawnInternal = useCallback(
      (
        x: number,
        y: number,
        z: number,
        count = 20,
        overrides: Record<string, unknown> | null = null
      ) => {
        if (!initialized.current || !renderer) return

        // Apply overrides and get restore function
        const restore = applySpawnOverrides(overrides)

        const startIdx = nextIndex.current
        const endIdx = (startIdx + count) % activeMaxParticles

        uniforms.spawnPosition.value.set(x, y, z)
        uniforms.spawnIndexStart.value = startIdx
        uniforms.spawnIndexEnd.value = endIdx
        uniforms.spawnSeed.value = Math.random() * 10000

        nextIndex.current = endIdx

        // Run compute - GPU reads uniforms when dispatched, so restore immediately
        // This prevents race conditions when multiple emitters spawn in the same frame
        // @ts-expect-error - WebGPU computeAsync not in WebGL types
        renderer.computeAsync(computeSpawn)

        // Restore original values synchronously after dispatch
        if (restore) restore()
      },
      [
        renderer,
        computeSpawn,
        uniforms,
        activeMaxParticles,
        applySpawnOverrides,
      ]
    )

    // Public spawn - uses position prop as offset, supports overrides
    // spawn(x, y, z, count, { colorStart: [...], direction: [...], ... })
    const spawn = useCallback(
      (
        x = 0,
        y = 0,
        z = 0,
        count = 20,
        overrides: Record<string, unknown> | null = null
      ) => {
        const [px, py, pz] = positionRef.current ?? [0, 0, 0]
        spawnInternal(px + x, py + y, pz + z, count, overrides)
      },
      [spawnInternal]
    )

    // Keep computeUpdate in a ref so useFrame always has the latest version
    const computeUpdateRef = useRef(computeUpdate)
    useEffect(() => {
      computeUpdateRef.current = computeUpdate
    }, [computeUpdate])

    // Update each frame + auto emit
    useFrame(async (state, delta) => {
      if (!initialized.current || !renderer) return

      // Update deltaTime uniform for framerate independence
      uniforms.deltaTime.value = delta

      // Update turbulence time (animated noise field)
      const turbSpeed = turbulenceRef.current?.speed ?? 1
      uniforms.turbulenceTime.value += delta * turbSpeed

      // Update particles - use ref to always get latest computeUpdate
      // @ts-expect-error - WebGPU computeAsync not in WebGL types
      await renderer.computeAsync(computeUpdateRef.current)

      // Auto emit if enabled
      if (emitting) {
        const [px, py, pz] = positionRef.current
        const currentDelay = delayRef.current
        const currentEmitCount = emitCountRef.current

        if (!currentDelay) {
          // delay = 0 or undefined → emit every frame
          spawnInternal(px, py, pz, currentEmitCount)
        } else {
          // delay > 0 → emit every X seconds
          emitAccumulator.current += delta

          if (emitAccumulator.current >= currentDelay) {
            emitAccumulator.current -= currentDelay
            spawnInternal(px, py, pz, currentEmitCount)
          }
        }
      }
    })

    // Start/stop functions
    const start = useCallback(() => {
      setEmitting(true)
      emitAccumulator.current = 0
    }, [])

    const stop = useCallback(() => {
      setEmitting(false)
    }, [])

    // Cleanup old material/renderObject when they change (not on unmount)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevMaterialRef = useRef<any>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevRenderObjectRef = useRef<any>(null)

    useEffect(() => {
      // Dispose previous material if it changed
      if (prevMaterialRef.current && prevMaterialRef.current !== material) {
        prevMaterialRef.current.dispose()
      }
      prevMaterialRef.current = material

      // Dispose previous renderObject if it changed
      if (
        prevRenderObjectRef.current &&
        prevRenderObjectRef.current !== renderObject
      ) {
        if (prevRenderObjectRef.current.material) {
          prevRenderObjectRef.current.material.dispose()
        }
      }
      prevRenderObjectRef.current = renderObject
    }, [material, renderObject])

    // Cleanup on actual unmount only
    useEffect(() => {
      return () => {
        // Dispose material
        if (material) {
          material.dispose()
        }

        // Dispose render object
        if (renderObject) {
          if (renderObject.geometry && !geometry) {
            renderObject.geometry.dispose()
          }
          if (renderObject.material) {
            renderObject.material.dispose()
          }
        }

        // Reset initialization state only on unmount
        initialized.current = false
        nextIndex.current = 0
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Expose methods via ref
    // Create the API object that will be exposed via ref and registered with store
    const particleAPI = useMemo(
      () => ({
        spawn,
        start,
        stop,
        get isEmitting() {
          return emitting
        },
        clear() {
          // @ts-expect-error WebGPU renderer method
          renderer.computeAsync(computeInit)
          nextIndex.current = 0
        },
        uniforms,
      }),
      [spawn, start, stop, emitting, renderer, computeInit, uniforms]
    )

    useImperativeHandle(ref, () => particleAPI, [particleAPI])

    // Register with VFX store when name prop is provided
    const registerParticles = useVFXStore((s) => s.registerParticles)
    const unregisterParticles = useVFXStore((s) => s.unregisterParticles)

    useEffect(() => {
      if (!name) return

      // Register this particle system with the store
      registerParticles(name, particleAPI)

      return () => {
        // Unregister on unmount or name change
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

        // Size
        if ('size' in newValues) {
          const sizeR = toRange(newValues.size, [0.1, 0.3])
          uniforms.sizeMin.value = sizeR[0]
          uniforms.sizeMax.value = sizeR[1]
        }

        // Fade Size
        if ('fadeSize' in newValues) {
          const fadeSizeR = toRange(newValues.fadeSize, [1, 0])
          uniforms.fadeSizeStart.value = fadeSizeR[0]
          uniforms.fadeSizeEnd.value = fadeSizeR[1]
        }

        // Fade Opacity
        if ('fadeOpacity' in newValues) {
          const fadeOpacityR = toRange(newValues.fadeOpacity, [1, 0])
          uniforms.fadeOpacityStart.value = fadeOpacityR[0]
          uniforms.fadeOpacityEnd.value = fadeOpacityR[1]
        }

        // Curves - update state to trigger texture regeneration
        // Only set if the key exists (to allow clearing curves by setting to null)
        if ('fadeSizeCurve' in newValues) {
          setActiveFadeSizeCurve(newValues.fadeSizeCurve)
          // Update fade size curve enabled uniform
          uniforms.fadeSizeCurveEnabled.value = newValues.fadeSizeCurve ? 1 : 0
        }
        if ('fadeOpacityCurve' in newValues) {
          setActiveFadeOpacityCurve(newValues.fadeOpacityCurve)
          // Update fade opacity curve enabled uniform
          uniforms.fadeOpacityCurveEnabled.value = newValues.fadeOpacityCurve
            ? 1
            : 0
        }
        if ('velocityCurve' in newValues) {
          setActiveVelocityCurve(newValues.velocityCurve)
          // Update velocity curve enabled uniform
          uniforms.velocityCurveEnabled.value = newValues.velocityCurve ? 1 : 0
        }
        if ('rotationSpeedCurve' in newValues) {
          setActiveRotationSpeedCurve(newValues.rotationSpeedCurve)
          // Update rotation speed curve enabled uniform
          uniforms.rotationSpeedCurveEnabled.value =
            newValues.rotationSpeedCurve ? 1 : 0
        }

        // Orient axis
        if ('orientAxis' in newValues) {
          uniforms.orientAxisType.value = axisToNumber(newValues.orientAxis)
        }

        // Stretch by speed
        if ('stretchBySpeed' in newValues) {
          uniforms.stretchEnabled.value = newValues.stretchBySpeed ? 1 : 0
          uniforms.stretchFactor.value = newValues.stretchBySpeed?.factor ?? 1
          uniforms.stretchMax.value = newValues.stretchBySpeed?.maxStretch ?? 5
        }

        // Physics - update gravity Vector3 components directly
        if (newValues.gravity && Array.isArray(newValues.gravity)) {
          uniforms.gravity.value.x = newValues.gravity[0]
          uniforms.gravity.value.y = newValues.gravity[1]
          uniforms.gravity.value.z = newValues.gravity[2]
        }

        // Speed
        if ('speed' in newValues) {
          const speedR = toRange(newValues.speed, [0.1, 0.1])
          uniforms.speedMin.value = speedR[0]
          uniforms.speedMax.value = speedR[1]
        }

        // Lifetime
        if ('lifetime' in newValues) {
          const lifetimeR = toRange(newValues.lifetime, [1, 2])
          uniforms.lifetimeMin.value = 1 / lifetimeR[1]
          uniforms.lifetimeMax.value = 1 / lifetimeR[0]
        }

        // Friction
        if ('friction' in newValues && newValues.friction) {
          const frictionR = toRange(newValues.friction.intensity, [0, 0])
          uniforms.frictionIntensityStart.value = frictionR[0]
          uniforms.frictionIntensityEnd.value = frictionR[1]
          uniforms.frictionEasingType.value = easingToType(
            newValues.friction.easing
          )
        }

        // Direction 3D
        if ('direction' in newValues) {
          const dir3D = toRotation3D(newValues.direction)
          uniforms.dirMinX.value = dir3D[0][0]
          uniforms.dirMaxX.value = dir3D[0][1]
          uniforms.dirMinY.value = dir3D[1][0]
          uniforms.dirMaxY.value = dir3D[1][1]
          uniforms.dirMinZ.value = dir3D[2][0]
          uniforms.dirMaxZ.value = dir3D[2][1]
        }

        // Start position 3D
        if ('startPosition' in newValues) {
          const startPos3D = toRotation3D(newValues.startPosition)
          uniforms.startPosMinX.value = startPos3D[0][0]
          uniforms.startPosMaxX.value = startPos3D[0][1]
          uniforms.startPosMinY.value = startPos3D[1][0]
          uniforms.startPosMaxY.value = startPos3D[1][1]
          uniforms.startPosMinZ.value = startPos3D[2][0]
          uniforms.startPosMaxZ.value = startPos3D[2][1]
        }

        // Rotation 3D
        if ('rotation' in newValues) {
          const rot3D = toRotation3D(newValues.rotation)
          uniforms.rotationMinX.value = rot3D[0][0]
          uniforms.rotationMaxX.value = rot3D[0][1]
          uniforms.rotationMinY.value = rot3D[1][0]
          uniforms.rotationMaxY.value = rot3D[1][1]
          uniforms.rotationMinZ.value = rot3D[2][0]
          uniforms.rotationMaxZ.value = rot3D[2][1]
        }

        // Rotation speed 3D
        if ('rotationSpeed' in newValues) {
          const rotSpeed3D = toRotation3D(newValues.rotationSpeed)
          uniforms.rotationSpeedMinX.value = rotSpeed3D[0][0]
          uniforms.rotationSpeedMaxX.value = rotSpeed3D[0][1]
          uniforms.rotationSpeedMinY.value = rotSpeed3D[1][0]
          uniforms.rotationSpeedMaxY.value = rotSpeed3D[1][1]
          uniforms.rotationSpeedMinZ.value = rotSpeed3D[2][0]
          uniforms.rotationSpeedMaxZ.value = rotSpeed3D[2][1]
        }

        // Update rotation storage state if rotation values changed (triggers storage array recreation)
        if ('rotation' in newValues || 'rotationSpeed' in newValues) {
          const rot = newValues.rotation ??
            debugValuesRef.current?.rotation ?? [0, 0]
          const rotSpeed = newValues.rotationSpeed ??
            debugValuesRef.current?.rotationSpeed ?? [0, 0]
          const needsRotation =
            isNonDefaultRotation(rot) || isNonDefaultRotation(rotSpeed)
          if (needsRotation !== activeNeedsRotation) {
            setActiveNeedsRotation(needsRotation)
          }
        }

        // Intensity
        if ('intensity' in newValues) {
          uniforms.intensity.value = newValues.intensity || 1
        }

        // Colors
        if ('colorStart' in newValues && newValues.colorStart) {
          const startColors = newValues.colorStart.slice(0, 8).map(hexToRgb)
          while (startColors.length < 8)
            startColors.push(startColors[startColors.length - 1] || [1, 1, 1])
          uniforms.colorStartCount.value = newValues.colorStart.length
          startColors.forEach((c: [number, number, number], i: number) => {
            // @ts-expect-error Dynamic uniform indexing
            if (uniforms[`colorStart${i}`]) {
              // @ts-expect-error Dynamic uniform indexing
              uniforms[`colorStart${i}`].value.setRGB(...c)
            }
          })

          // If colorEnd is disabled (null), also update colorEnd to match colorStart (no color transition)
          const currentColorEnd = debugValuesRef.current?.colorEnd
          if (!currentColorEnd) {
            uniforms.colorEndCount.value = newValues.colorStart.length
            startColors.forEach((c: [number, number, number], i: number) => {
              // @ts-expect-error Dynamic uniform indexing
              if (uniforms[`colorEnd${i}`]) {
                // @ts-expect-error Dynamic uniform indexing
                uniforms[`colorEnd${i}`].value.setRGB(...c)
              }
            })
          }
        }

        // Color End - if colorEnd is explicitly set (including null), handle it
        if ('colorEnd' in newValues) {
          // If colorEnd is null/falsy, use colorStart for end colors (no color transition)
          // Fall back to debugValuesRef if newValues.colorStart isn't present
          const effectiveEndColors = newValues.colorEnd ||
            newValues.colorStart ||
            debugValuesRef.current?.colorStart || ['#ffffff']
          if (effectiveEndColors) {
            const endColors = effectiveEndColors.slice(0, 8).map(hexToRgb)
            while (endColors.length < 8)
              endColors.push(endColors[endColors.length - 1] || [1, 1, 1])
            uniforms.colorEndCount.value = effectiveEndColors.length
            endColors.forEach((c: [number, number, number], i: number) => {
              // @ts-expect-error Dynamic uniform indexing
              if (uniforms[`colorEnd${i}`]) {
                // @ts-expect-error Dynamic uniform indexing
                uniforms[`colorEnd${i}`].value.setRGB(...c)
              }
            })
          }
        }

        // Update per-particle color state if colors changed (triggers storage array recreation)
        if ('colorStart' in newValues || 'colorEnd' in newValues) {
          const startLen =
            newValues.colorStart?.length ??
            debugValuesRef.current?.colorStart?.length ??
            1
          const hasColorEnd =
            'colorEnd' in newValues
              ? newValues.colorEnd !== null
              : debugValuesRef.current?.colorEnd !== null
          const needsPerParticle = startLen > 1 || hasColorEnd
          if (needsPerParticle !== activeNeedsPerParticleColor) {
            setActiveNeedsPerParticleColor(needsPerParticle)
          }
        }

        // Emitter shape
        if ('emitterShape' in newValues) {
          uniforms.emitterShapeType.value =
            newValues.emitterShape ?? EmitterShape.BOX
        }
        if ('emitterRadius' in newValues) {
          const emitterRadiusR = toRange(newValues.emitterRadius, [0, 1])
          uniforms.emitterRadiusInner.value = emitterRadiusR[0]
          uniforms.emitterRadiusOuter.value = emitterRadiusR[1]
        }
        if ('emitterAngle' in newValues) {
          uniforms.emitterAngle.value = newValues.emitterAngle ?? Math.PI / 4
        }
        if ('emitterHeight' in newValues) {
          const emitterHeightR = toRange(newValues.emitterHeight, [0, 1])
          uniforms.emitterHeightMin.value = emitterHeightR[0]
          uniforms.emitterHeightMax.value = emitterHeightR[1]
        }
        if ('emitterSurfaceOnly' in newValues) {
          uniforms.emitterSurfaceOnly.value = newValues.emitterSurfaceOnly
            ? 1
            : 0
        }
        if (
          'emitterDirection' in newValues &&
          newValues.emitterDirection &&
          Array.isArray(newValues.emitterDirection)
        ) {
          const dir = new THREE.Vector3(
            ...newValues.emitterDirection
          ).normalize()
          uniforms.emitterDir.value.x = dir.x
          uniforms.emitterDir.value.y = dir.y
          uniforms.emitterDir.value.z = dir.z
        }

        // Turbulence
        if ('turbulence' in newValues) {
          uniforms.turbulenceIntensity.value =
            newValues.turbulence?.intensity ?? 0
          uniforms.turbulenceFrequency.value =
            newValues.turbulence?.frequency ?? 1
          uniforms.turbulenceSpeed.value = newValues.turbulence?.speed ?? 1
          turbulenceRef.current = newValues.turbulence
          const needsTurbulence =
            newValues.turbulence !== null &&
            (newValues.turbulence?.intensity ?? 0) > 0
          if (needsTurbulence !== activeTurbulence) {
            setActiveTurbulence(needsTurbulence)
          }
        }

        // Attract to center
        if ('attractToCenter' in newValues) {
          uniforms.attractToCenter.value = newValues.attractToCenter ? 1 : 0
        }

        // Start position as direction
        if ('startPositionAsDirection' in newValues) {
          uniforms.startPositionAsDirection.value =
            newValues.startPositionAsDirection ? 1 : 0
        }

        // Soft particles
        if ('softParticles' in newValues) {
          uniforms.softParticlesEnabled.value = newValues.softParticles ? 1 : 0
        }
        if ('softDistance' in newValues) {
          uniforms.softDistance.value = newValues.softDistance ?? 0.5
        }

        // Collision
        if ('collision' in newValues) {
          uniforms.collisionEnabled.value = newValues.collision ? 1 : 0
          uniforms.collisionPlaneY.value = newValues.collision?.plane?.y ?? 0
          uniforms.collisionBounce.value = newValues.collision?.bounce ?? 0.3
          uniforms.collisionFriction.value =
            newValues.collision?.friction ?? 0.8
          uniforms.collisionDie.value = newValues.collision?.die ? 1 : 0
          uniforms.sizeBasedGravity.value =
            newValues.collision?.sizeBasedGravity ?? 0
          const needsCollision =
            newValues.collision !== null && newValues.collision !== undefined
          if (needsCollision !== activeCollision) {
            setActiveCollision(needsCollision)
          }
        }

        // Attractors
        if ('attractors' in newValues) {
          const needsAttractors =
            newValues.attractors !== null && newValues.attractors?.length > 0
          if (needsAttractors !== activeAttractors) {
            setActiveAttractors(needsAttractors)
          }
        }

        // Position ref update
        if (newValues.position) {
          positionRef.current = newValues.position
        }

        // Runtime refs update (for values used in useFrame)
        if ('delay' in newValues) delayRef.current = newValues.delay ?? 0
        if ('emitCount' in newValues)
          emitCountRef.current = newValues.emitCount ?? 1
        // turbulenceRef is updated in the turbulence block above

        // Update emitting state
        if (newValues.autoStart !== undefined) {
          setEmitting(newValues.autoStart)
        }

        // Update material blending directly
        if (material && newValues.blending !== undefined) {
          material.blending = newValues.blending
          material.needsUpdate = true
        }

        // Remount-required values - these trigger useMemo recalculation
        if (
          newValues.maxParticles !== undefined &&
          newValues.maxParticles !== activeMaxParticles
        ) {
          setActiveMaxParticles(newValues.maxParticles)
          initialized.current = false // Force re-init
          nextIndex.current = 0
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

        // Handle geometry type and args changes - only recreate if those keys were actually changed
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

            import('./VFXParticlesDebugPanel').then(
              ({ createGeometry, GeometryType }) => {
                if (geoType === GeometryType.NONE || !geoType) {
                  // Dispose old geometry if switching to sprite mode
                  if (activeGeometry !== null && !geometry) {
                    activeGeometry.dispose()
                  }
                  setActiveGeometry(null)
                } else {
                  const newGeometry = createGeometry(geoType, geoArgs)
                  if (newGeometry) {
                    // Dispose old geometry if it was created by debug panel (not from props)
                    if (
                      activeGeometry !== null &&
                      activeGeometry !== geometry
                    ) {
                      activeGeometry.dispose()
                    }
                    setActiveGeometry(newGeometry)
                  }
                }
              }
            )
          }
        }
      },
      [
        uniforms,
        material,
        renderObject,
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

      // Initialize debug values from props
      const initialValues = {
        name, // Include name for curve baking filename
        maxParticles,
        size,
        colorStart,
        colorEnd,
        fadeSize,
        fadeSizeCurve: fadeSizeCurve || null, // null = linear (no curve)
        fadeOpacity,
        fadeOpacityCurve: fadeOpacityCurve || null, // null = linear (no curve)
        velocityCurve: velocityCurve || null, // null = use friction (no curve)
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
        rotationSpeedCurve: rotationSpeedCurve || null, // null = constant speed (no curve)
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
        // Geometry type and args - detect from passed geometry if possible
        ...detectGeometryTypeAndArgs(geometry),
      }

      // Helper to detect geometry type from THREE.js geometry object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function detectGeometryTypeAndArgs(geo: any) {
        if (!geo) return { geometryType: 'none', geometryArgs: null }

        const name = geo.constructor.name
        const params = geo.parameters || {}

        switch (name) {
          case 'BoxGeometry':
            return {
              geometryType: 'box',
              geometryArgs: {
                width: params.width ?? 1,
                height: params.height ?? 1,
                depth: params.depth ?? 1,
                widthSegments: params.widthSegments ?? 1,
                heightSegments: params.heightSegments ?? 1,
                depthSegments: params.depthSegments ?? 1,
              },
            }
          case 'SphereGeometry':
            return {
              geometryType: 'sphere',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                widthSegments: params.widthSegments ?? 16,
                heightSegments: params.heightSegments ?? 12,
              },
            }
          case 'CylinderGeometry':
            return {
              geometryType: 'cylinder',
              geometryArgs: {
                radiusTop: params.radiusTop ?? 0.5,
                radiusBottom: params.radiusBottom ?? 0.5,
                height: params.height ?? 1,
                radialSegments: params.radialSegments ?? 16,
                heightSegments: params.heightSegments ?? 1,
              },
            }
          case 'ConeGeometry':
            return {
              geometryType: 'cone',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                height: params.height ?? 1,
                radialSegments: params.radialSegments ?? 16,
                heightSegments: params.heightSegments ?? 1,
              },
            }
          case 'TorusGeometry':
            return {
              geometryType: 'torus',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                tube: params.tube ?? 0.2,
                radialSegments: params.radialSegments ?? 12,
                tubularSegments: params.tubularSegments ?? 24,
              },
            }
          case 'PlaneGeometry':
            return {
              geometryType: 'plane',
              geometryArgs: {
                width: params.width ?? 1,
                height: params.height ?? 1,
                widthSegments: params.widthSegments ?? 1,
                heightSegments: params.heightSegments ?? 1,
              },
            }
          case 'CircleGeometry':
            return {
              geometryType: 'circle',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                segments: params.segments ?? 16,
              },
            }
          case 'RingGeometry':
            return {
              geometryType: 'ring',
              geometryArgs: {
                innerRadius: params.innerRadius ?? 0.25,
                outerRadius: params.outerRadius ?? 0.5,
                thetaSegments: params.thetaSegments ?? 16,
              },
            }
          case 'DodecahedronGeometry':
            return {
              geometryType: 'dodecahedron',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                detail: params.detail ?? 0,
              },
            }
          case 'IcosahedronGeometry':
            return {
              geometryType: 'icosahedron',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                detail: params.detail ?? 0,
              },
            }
          case 'OctahedronGeometry':
            return {
              geometryType: 'octahedron',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                detail: params.detail ?? 0,
              },
            }
          case 'TetrahedronGeometry':
            return {
              geometryType: 'tetrahedron',
              geometryArgs: {
                radius: params.radius ?? 0.5,
                detail: params.detail ?? 0,
              },
            }
          case 'CapsuleGeometry':
            return {
              geometryType: 'capsule',
              geometryArgs: {
                radius: params.radius ?? 0.25,
                length: params.length ?? 0.5,
                capSegments: params.capSegments ?? 4,
                radialSegments: params.radialSegments ?? 8,
              },
            }
          default:
            // Unknown geometry type - show as "none" but keep the geometry
            return { geometryType: 'none', geometryArgs: null }
        }
      }
      debugValuesRef.current = initialValues
      // Initialize geometry tracking refs
      prevGeometryTypeRef.current = initialValues.geometryType
      prevGeometryArgsRef.current = initialValues.geometryArgs

      // Render debug panel
      import('./VFXParticlesDebugPanel').then(({ renderDebugPanel }) => {
        renderDebugPanel(initialValues, handleDebugUpdate)
      })

      return () => {
        import('./VFXParticlesDebugPanel').then(({ destroyDebugPanel }) => {
          destroyDebugPanel()
        })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debug, geometry])

    // Update debug panel callback when handleDebugUpdate changes (e.g., after state changes)
    useEffect(() => {
      if (!debug) return
      import('./VFXParticlesDebugPanel').then(({ updateDebugPanel }) => {
        if (debugValuesRef.current) {
          // Pass a NEW object copy to trigger the reference check in debug panel
          updateDebugPanel({ ...debugValuesRef.current }, handleDebugUpdate)
        }
      })
    }, [debug, handleDebugUpdate])

    // @ts-expect-error R3F primitive element
    return <primitive ref={spriteRef} object={renderObject} />
  }
)
