import type { ParticleStorageArrays } from '../shaders/types'

/**
 * CPU-side typed array references extracted from TSL storage nodes.
 * Each field corresponds to a ParticleStorageArrays entry.
 */
export type CPUStorageArrays = {
  positions: Float32Array // vec3 → stride 3
  velocities: Float32Array // vec3 → stride 3
  lifetimes: Float32Array // float → stride 1
  fadeRates: Float32Array // float → stride 1
  particleSizes: Float32Array // float → stride 1
  particleRotations: Float32Array | null // vec3 → stride 3
  particleColorStarts: Float32Array | null // vec3 → stride 3
  particleColorEnds: Float32Array | null // vec3 → stride 3
}

/**
 * Extract raw Float32Array references from TSL instancedArray storage nodes.
 * The underlying buffer is at `(node as any).value.array`.
 */
export const extractCPUArrays = (
  storage: ParticleStorageArrays
): CPUStorageArrays => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getArray = (node: any): Float32Array => node.value.array as Float32Array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getArrayOrNull = (node: any): Float32Array | null =>
    node ? (node.value.array as Float32Array) : null

  return {
    positions: getArray(storage.positions),
    velocities: getArray(storage.velocities),
    lifetimes: getArray(storage.lifetimes),
    fadeRates: getArray(storage.fadeRates),
    particleSizes: getArray(storage.particleSizes),
    particleRotations: getArrayOrNull(storage.particleRotations),
    particleColorStarts: getArrayOrNull(storage.particleColorStarts),
    particleColorEnds: getArrayOrNull(storage.particleColorEnds),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mark = (node: any) => {
  if (node?.value) node.value.needsUpdate = true
}

/**
 * Mark all storage buffers as needing upload to GPU.
 * After CPU writes, Three.js needs `.needsUpdate = true` to sync.
 */
export const markAllDirty = (storage: ParticleStorageArrays): void => {
  mark(storage.positions)
  mark(storage.velocities)
  mark(storage.lifetimes)
  mark(storage.fadeRates)
  mark(storage.particleSizes)
  mark(storage.particleRotations)
  mark(storage.particleColorStarts)
  mark(storage.particleColorEnds)
}

/**
 * Mark only buffers that change during update (per-frame simulation).
 * Skips fadeRates, particleSizes, and colors which only change at spawn time.
 */
export const markUpdateDirty = (
  storage: ParticleStorageArrays,
  hasRotation: boolean
): void => {
  mark(storage.positions)
  mark(storage.velocities)
  mark(storage.lifetimes)
  if (hasRotation) mark(storage.particleRotations)
}
