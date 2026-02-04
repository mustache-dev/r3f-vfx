export { type CoreState, type ParticleSystemRef, coreStore } from './core-store'

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
  NormalizedParticleProps,
  VFXParticleSystemOptions,
  EmitterControllerOptions,
} from './types'

// Utilities
export {
  isWebGPUBackend,
  hexToRgb,
  toRange,
  easingToType,
  axisToNumber,
  toRotation3D,
  lifetimeToFadeRate,
  isNonDefaultRotation,
  normalizeProps,
} from './utils'

// Curve utilities
export {
  evaluateBezierSegment,
  sampleCurveAtX,
  bakeCurveToArray,
  createCombinedCurveTexture,
  createDefaultCurveTexture,
  loadCurveTextureFromPath,
  buildCurveTextureBin,
  resolveCurveTexture,
  CurveChannel,
  DEFAULT_LINEAR_CURVE,
} from './curves'

export type { CurveTextureResult, CurveTextureResolved } from './curves'

// Shader factories
export {
  createInitCompute,
  createSpawnCompute,
  createUpdateCompute,
  createParticleMaterial,
  selectColor,
} from './shaders'

// Shader types
export type {
  ParticleStorageArrays,
  ParticleUniforms,
  MaterialOptions,
  ShaderFeatures,
} from './shaders'

// Uniforms
export {
  createUniforms,
  updateUniforms,
  updateUniformsPartial,
  updateUniformsCurveFlags,
  applySpawnOverrides,
} from './uniforms'

// Storage
export {
  createStorageArrays,
  createRenderObject,
  resolveFeatures,
  needsRecreation,
  STRUCTURAL_KEYS,
} from './storage'

// Particle system class
export { VFXParticleSystem } from './particle-system'

// Emitter controller class
export { EmitterController } from './emitter'
