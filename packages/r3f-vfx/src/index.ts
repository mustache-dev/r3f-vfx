export {
  VFXParticles,
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
} from './VFXParticles'

export type { CurveTextureResult } from './VFXParticles'

export { VFXEmitter, useVFXEmitter } from './VFXEmitter'

export { useVFXStore } from './react-store'

export { useCurveTextureAsync } from './useCurveTextureAsync'
export type { CurveTextureHookResult } from './useCurveTextureAsync'

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
} from 'core-vfx'
