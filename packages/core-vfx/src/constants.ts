import * as THREE from 'three/webgpu'

// Appearance enum for particle shapes
export const Appearance = Object.freeze({
  DEFAULT: 'default',
  GRADIENT: 'gradient',
  CIRCULAR: 'circular',
})

// Blending modes
export const Blending = Object.freeze({
  NORMAL: THREE.NormalBlending,
  ADDITIVE: THREE.AdditiveBlending,
  MULTIPLY: THREE.MultiplyBlending,
  SUBTRACTIVE: THREE.SubtractiveBlending,
})

// Emitter shape types
export const EmitterShape = Object.freeze({
  POINT: 0, // Single point emission
  BOX: 1, // Box/cube volume (uses startPosition ranges)
  SPHERE: 2, // Sphere surface or volume
  CONE: 3, // Cone shape (great for fire, fountains)
  DISK: 4, // Flat disk/circle
  EDGE: 5, // Line between two points
})

// Attractor types
export const AttractorType = Object.freeze({
  POINT: 0, // Pull toward a point (or push if negative strength)
  VORTEX: 1, // Swirl around an axis
})

// Easing types for curves (friction, etc.)
export const Easing = Object.freeze({
  LINEAR: 0,
  EASE_IN: 1,
  EASE_OUT: 2,
  EASE_IN_OUT: 3,
})

// Lighting/material types for geometry-based particles
export const Lighting = Object.freeze({
  BASIC: 'basic', // No lighting, flat colors (MeshBasicNodeMaterial)
  STANDARD: 'standard', // Standard PBR (MeshStandardNodeMaterial)
  PHYSICAL: 'physical', // Advanced PBR with clearcoat, transmission, etc. (MeshPhysicalNodeMaterial)
})

// Max number of attractors supported
export const MAX_ATTRACTORS = 4

// Number of samples in baked curve textures
export const CURVE_RESOLUTION = 256
