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
} from './VFXParticles'

export { VFXEmitter, useVFXEmitter } from './VFXEmitter'

export { useVFXStore } from './react-store'

export { useCurveTextureAsync } from './useCurveTextureAsync'

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
