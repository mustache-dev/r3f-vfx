export { type CoreState, coreStore } from './core-store'

// Constants
export {
  Appearance,
  Blending,
  EmitterShape,
  AttractorType,
  Easing,
  Lighting,
  MAX_ATTRACTORS,
  CURVE_RESOLUTION,
} from './constants'

// Types
export type {
  CurvePoint,
  CurveData,
  Rotation3DInput,
  ParticleData,
  TurbulenceConfig,
  AttractorConfig,
  CollisionConfig,
  FrictionConfig,
  FlipbookConfig,
  StretchConfig,
  BaseParticleProps,
} from './types'

// Utilities
export {
  hexToRgb,
  toRange,
  easingToType,
  axisToNumber,
  toRotation3D,
  lifetimeToFadeRate,
} from './utils'

// Curve utilities
export {
  evaluateBezierSegment,
  sampleCurveAtX,
  bakeCurveToArray,
  createCombinedCurveTexture,
  createDefaultCurveTexture,
  loadCurveTextureFromPath,
  DEFAULT_LINEAR_CURVE,
} from './curves'

// Shader factories
export {
  createInitCompute,
  createSpawnCompute,
  createUpdateCompute,
  createParticleMaterial,
  selectColor,
} from './shaders'

// Shader types
export type { ParticleStorageArrays, ParticleUniforms, MaterialOptions, ShaderFeatures } from './shaders'
