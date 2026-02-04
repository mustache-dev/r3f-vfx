export { VFXParticles } from './VFXParticles'
export type { VFXParticlesProps } from './VFXParticles'

export { VFXEmitter, useVFXEmitter } from './VFXEmitter'
export type { VFXEmitterProps } from './VFXEmitter'

export { useVFXStore } from './vue-store'

// Re-export constants from core-vfx
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

// Re-export types from core-vfx for convenience
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
} from 'core-vfx'

// Re-export core classes for direct usage
export {
  VFXParticleSystem,
  EmitterController,
  isWebGPUBackend,
  isNonDefaultRotation,
  normalizeProps,
  resolveCurveTexture,
} from 'core-vfx'

export type { CurveTextureResolved } from 'core-vfx'
