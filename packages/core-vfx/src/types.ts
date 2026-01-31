import type * as THREE from 'three/webgpu'
import type { Appearance, EmitterShape, Lighting } from './constants'

// Curve point for Bezier splines
export type CurvePoint = {
  pos: [number, number]
  handleIn?: [number, number]
  handleOut?: [number, number]
}

// Curve data structure
export type CurveData = {
  points: CurvePoint[]
} | null

// 3D rotation/direction input types
export type Rotation3DInput =
  | number
  | [number, number]
  | [[number, number], [number, number], [number, number]]
  | null
  | undefined

// Particle data passed to custom node functions
export type ParticleData = Record<string, unknown>

// Turbulence configuration
export type TurbulenceConfig = {
  intensity: number
  frequency?: number
  speed?: number
} | null

// Attractor configuration
export type AttractorConfig = {
  position?: [number, number, number]
  strength?: number
  radius?: number
  type?: 'point' | 'vortex'
  axis?: [number, number, number]
}

// Collision configuration
export type CollisionConfig = {
  plane?: { y: number }
  bounce?: number
  friction?: number
  die?: boolean
  sizeBasedGravity?: number
} | null

// Friction configuration
export type FrictionConfig = {
  intensity?: number | [number, number]
  easing?: string
}

// Flipbook configuration
export type FlipbookConfig = {
  rows: number
  columns: number
} | null

// Stretch by speed configuration
export type StretchConfig = {
  factor: number
  maxStretch: number
} | null

// Normalized particle props - all shorthand/optional values resolved to canonical form
export type NormalizedParticleProps = {
  maxParticles: number
  sizeRange: [number, number]
  speedRange: [number, number]
  fadeSizeRange: [number, number]
  fadeOpacityRange: [number, number]
  lifetimeRange: [number, number]
  gravity: [number, number, number]
  direction3D: [[number, number], [number, number], [number, number]]
  startPosition3D: [[number, number], [number, number], [number, number]]
  rotation3D: [[number, number], [number, number], [number, number]]
  rotationSpeed3D: [[number, number], [number, number], [number, number]]
  frictionIntensityRange: [number, number]
  frictionEasingType: number
  startColors: [number, number, number][]
  endColors: [number, number, number][]
  colorStartCount: number
  colorEndCount: number
  emitterRadiusRange: [number, number]
  emitterHeightRange: [number, number]
  intensity: number
  position: [number, number, number]
  autoStart: boolean
  delay: number
  emitCount: number
  emitterShape: number
  emitterAngle: number
  emitterSurfaceOnly: boolean
  emitterDirection: [number, number, number]
  turbulence: TurbulenceConfig
  attractors: AttractorConfig[] | null
  attractToCenter: boolean
  startPositionAsDirection: boolean
  softParticles: boolean
  softDistance: number
  collision: CollisionConfig
  appearance: string
  alphaMap: THREE.Texture | null
  flipbook: FlipbookConfig
  rotation: Rotation3DInput
  rotationSpeed: Rotation3DInput
  geometry: THREE.BufferGeometry | null
  orientToDirection: boolean
  orientAxis: string
  stretchBySpeed: StretchConfig
  lighting: string
  shadow: boolean
  blending: THREE.Blending
  depthTest: boolean
  renderOrder: number
  colorStart: string[]
  colorEnd: string[] | null
  // Raw prop values for debug panel
  size: number | [number, number]
  speed: number | [number, number]
  fadeSize: number | [number, number]
  fadeOpacity: number | [number, number]
  lifetime: number | [number, number]
  direction: Rotation3DInput
  startPosition: Rotation3DInput
  friction: FrictionConfig
  emitterRadius: number | [number, number]
  emitterHeight: number | [number, number]
}

// Options for VFXParticleSystem constructor
export type VFXParticleSystemOptions = BaseParticleProps & {
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
  /** Depth test */
  depthTest?: boolean
  /** Render order (higher values render on top) */
  renderOrder?: number
  /** Path to pre-baked curve texture (skips runtime baking for faster load) */
  curveTexturePath?: string | null
}

// Options for EmitterController constructor
export type EmitterControllerOptions = {
  emitCount?: number
  delay?: number
  autoStart?: boolean
  loop?: boolean
  localDirection?: boolean
  direction?: [[number, number], [number, number], [number, number]]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overrides?: Record<string, any> | null
  onEmit?: (params: {
    position: [number, number, number] | number[]
    count: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    direction: any
  }) => void
}

// Base particle system props (framework-agnostic)
export type BaseParticleProps = {
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
  friction?: FrictionConfig
  /** Particle appearance type */
  appearance?: (typeof Appearance)[keyof typeof Appearance]
  /** Alpha map texture */
  alphaMap?: THREE.Texture | null
  /** Flipbook animation settings */
  flipbook?: FlipbookConfig
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
  stretchBySpeed?: StretchConfig
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
  turbulence?: TurbulenceConfig
  /** Array of attractors (max 4) */
  attractors?: AttractorConfig[] | null
  /** Particles move from spawn position to center over lifetime */
  attractToCenter?: boolean
  /** Use start position offset as direction */
  startPositionAsDirection?: boolean
  /** Fade particles when intersecting scene geometry */
  softParticles?: boolean
  /** Distance over which to fade soft particles */
  softDistance?: number
  /** Plane collision settings */
  collision?: CollisionConfig
}
