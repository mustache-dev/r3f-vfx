import * as THREE from 'three/webgpu'
import { instancedArray } from 'three/tsl'
import type { ParticleStorageArrays, ShaderFeatures } from './shaders/types'
import type { Rotation3DInput } from './types'
import { isNonDefaultRotation } from './utils'

// Keys whose change requires full system recreation (GPU pipeline rebuild)
export const STRUCTURAL_KEYS = [
  'maxParticles',
  'lighting',
  'appearance',
  'shadow',
  'orientToDirection',
] as const

export function resolveFeatures(props: {
  colorStart?: string[]
  colorEnd?: string[] | null
  rotation?: Rotation3DInput
  rotationSpeed?: Rotation3DInput
  turbulence?: { intensity: number; frequency?: number; speed?: number } | null
  attractors?: Array<{
    position?: [number, number, number]
    strength?: number
    radius?: number
    type?: 'point' | 'vortex'
    axis?: [number, number, number]
  }> | null
  collision?: {
    plane?: { y: number }
    bounce?: number
    friction?: number
    die?: boolean
    sizeBasedGravity?: number
  } | null
}): ShaderFeatures {
  const colorStart = props.colorStart ?? ['#ffffff']
  const colorEnd = props.colorEnd ?? null
  const rotation = props.rotation ?? [0, 0]
  const rotationSpeed = props.rotationSpeed ?? [0, 0]
  const turbulence = props.turbulence ?? null
  const attractors = props.attractors ?? null
  const collision = props.collision ?? null

  const needsPerParticleColor = colorStart.length > 1 || colorEnd !== null
  const needsRotation =
    isNonDefaultRotation(rotation) || isNonDefaultRotation(rotationSpeed)
  const hasTurbulence = turbulence !== null && (turbulence?.intensity ?? 0) > 0
  const hasAttractors = attractors !== null && attractors.length > 0
  const hasCollision = collision !== null

  return {
    needsPerParticleColor,
    needsRotation,
    turbulence: hasTurbulence,
    attractors: hasAttractors,
    collision: hasCollision,
    rotation: needsRotation,
    perParticleColor: needsPerParticleColor,
  }
}

// Check if changed props require full system recreation.
// `changedProps` is the partial update (only changed keys).
// `mergedConfig` is the full config after merging changedProps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function needsRecreation(
  currentFeatures: ShaderFeatures,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changedProps: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mergedConfig: Record<string, any>
): boolean {
  // Check structural keys
  if (STRUCTURAL_KEYS.some((key) => key in changedProps)) return true

  // Check feature flag changes
  const newFeatures = resolveFeatures(mergedConfig)

  if (newFeatures.turbulence !== currentFeatures.turbulence) return true
  if (newFeatures.attractors !== currentFeatures.attractors) return true
  if (newFeatures.collision !== currentFeatures.collision) return true
  if (newFeatures.needsRotation !== currentFeatures.needsRotation) return true
  if (
    newFeatures.needsPerParticleColor !== currentFeatures.needsPerParticleColor
  )
    return true

  return false
}

export function createStorageArrays(
  maxParticles: number,
  features: ShaderFeatures
): ParticleStorageArrays {
  const arrays: ParticleStorageArrays = {
    positions: instancedArray(maxParticles, 'vec3'),
    velocities: instancedArray(maxParticles, 'vec3'),
    lifetimes: instancedArray(maxParticles, 'float'),
    fadeRates: instancedArray(maxParticles, 'float'),
    particleSizes: instancedArray(maxParticles, 'float'),
    particleRotations: null,
    particleColorStarts: null,
    particleColorEnds: null,
  }

  if (features.needsRotation) {
    arrays.particleRotations = instancedArray(maxParticles, 'vec3')
  }

  if (features.needsPerParticleColor) {
    arrays.particleColorStarts = instancedArray(maxParticles, 'vec3')
    arrays.particleColorEnds = instancedArray(maxParticles, 'vec3')
  }

  return arrays
}

export function createRenderObject(
  geometry: THREE.BufferGeometry | null,
  material: THREE.Material,
  maxParticles: number,
  shadow: boolean
): THREE.Sprite | THREE.InstancedMesh {
  if (geometry) {
    const mesh = new THREE.InstancedMesh(geometry, material, maxParticles)
    mesh.frustumCulled = false
    mesh.castShadow = shadow
    mesh.receiveShadow = shadow
    return mesh
  } else {
    // @ts-expect-error - WebGPU SpriteNodeMaterial type mismatch
    const s = new THREE.Sprite(material)
    s.count = maxParticles
    s.frustumCulled = false
    return s
  }
}
