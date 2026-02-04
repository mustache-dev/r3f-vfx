export { VFXParticles } from './VFXParticles'
export type { VFXParticlesOptions } from './VFXParticles'

// Re-export constants from core-vfx
export {
  Appearance,
  Blending,
  EmitterShape,
  AttractorType,
  Easing,
  Lighting,
} from 'core-vfx'

// Re-export types from core-vfx
export type {
  BaseParticleProps,
  VFXParticleSystemOptions,
  TurbulenceConfig,
  AttractorConfig,
  CollisionConfig,
  FrictionConfig,
  FlipbookConfig,
  StretchConfig,
  CurveData,
  CurvePoint,
  Rotation3DInput,
  EmitterControllerOptions,
} from 'core-vfx'

// Re-export classes and curve utilities for advanced usage
export { VFXParticleSystem, EmitterController, isWebGPUBackend, resolveCurveTexture } from 'core-vfx'

export type { CurveTextureResolved } from 'core-vfx'
