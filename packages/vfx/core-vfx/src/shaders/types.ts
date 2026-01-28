import type * as THREE from 'three/webgpu'
import type { Node, StorageBufferNode } from 'three/webgpu'

// Storage arrays for particle data (uses StorageBufferNode for proper .toAttribute() typing)
// Optional arrays are null when feature is unused (saves GPU memory):
// - particleRotations: null when rotation=[0,0] and rotationSpeed=[0,0]
// - particleColorStarts/Ends: null when single color with no transition
export type ParticleStorageArrays = {
  positions: StorageBufferNode
  velocities: StorageBufferNode
  lifetimes: StorageBufferNode
  fadeRates: StorageBufferNode
  particleSizes: StorageBufferNode
  particleRotations: StorageBufferNode | null
  particleColorStarts: StorageBufferNode | null
  particleColorEnds: StorageBufferNode | null
}

// All uniforms used by the particle system
// These are TSL uniform nodes created by uniform(), which extend Node
export type ParticleUniforms = Record<string, Node>

// Feature flags for conditional shader generation
// When a feature is disabled, its uniforms and shader code are skipped entirely
export type ShaderFeatures = {
  turbulence: boolean    // Curl noise turbulence
  attractors: boolean    // Point/vortex attractors (up to 4)
  collision: boolean     // Plane collision with bounce/die
  rotation: boolean      // Per-particle rotation and rotation speed
  perParticleColor: boolean // Per-particle color arrays (vs single uniform color)
}

// Material creation options
export type MaterialOptions = {
  alphaMap: THREE.Texture | null
  flipbook: { rows: number; columns: number } | null
  appearance: string
  lighting: string
  softParticles: boolean
  geometry: THREE.BufferGeometry | null
  orientToDirection: boolean
  shadow: boolean
  blending: THREE.Blending
  // Custom nodes
  opacityNode: Node | ((data: Record<string, Node>) => Node) | null
  colorNode: Node | ((data: Record<string, Node>, defaultColor: Node) => Node) | null
  backdropNode: Node | ((data: Record<string, Node>) => Node) | null
  alphaTestNode: Node | ((data: Record<string, Node>) => Node) | null
  castShadowNode: Node | ((data: Record<string, Node>) => Node) | null
}
