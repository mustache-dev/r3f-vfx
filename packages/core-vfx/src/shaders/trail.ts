import { Fn, If, float, vec3, instanceIndex } from 'three/tsl'
import type { ParticleStorageArrays, ParticleUniforms } from './types'

/**
 * Creates a TSL function for MeshLine's gpuPositionNode (procedural mode).
 * Reconstructs trail positions by reverse-integrating particle velocity and gravity.
 *
 * progress = 0 → particle's current position (head of trail)
 * progress = 1 → extrapolated past position (tail of trail)
 */
export const createTrailProceduralPositionNode = (
  storage: ParticleStorageArrays,
  uniforms: ParticleUniforms
) => {
  return Fn(([progress]: [any]) => {
    const pos = storage.positions.element(instanceIndex)
    const vel = storage.velocities.element(instanceIndex)
    const lifetime = storage.lifetimes.element(instanceIndex)
    const trailLen = uniforms.trailLength

    // Time into the past for this trail segment
    const t = progress.mul(trailLen)

    // Reverse-integrate: position - velocity * t + 0.5 * gravity * t²
    const trailPos = pos
      .sub(vel.mul(t))
      .add(uniforms.gravity.mul(float(0.5)).mul(t.mul(t)))

    // Dead particles: collapse trail offscreen
    return lifetime.greaterThan(0).select(trailPos, vec3(0, -1000, 0))
  })
}

/**
 * Creates a compute shader that writes the current particle position
 * into the trail history ring buffer (history mode only).
 * Called once per frame after the particle update compute.
 */
export const createTrailHistoryCompute = (
  storage: ParticleStorageArrays,
  uniforms: ParticleUniforms,
  maxParticles: number,
  segments: number
) => {
  return Fn(() => {
    const pos = storage.positions.element(instanceIndex)
    const lifetime = storage.lifetimes.element(instanceIndex)

    // Write position into ring buffer at current head pointer
    const writeIdx = instanceIndex.mul(segments).add(uniforms.trailHead)
    If(lifetime.greaterThan(0), () => {
      storage.trailHistory!.element(writeIdx).assign(pos)
    })
  })().compute(maxParticles)
}

/**
 * Creates a TSL function for MeshLine's gpuPositionNode (history mode).
 * Reads chronologically from the ring buffer using modular indexing.
 */
export const createTrailHistoryPositionNode = (
  storage: ParticleStorageArrays,
  uniforms: ParticleUniforms,
  segments: number
) => {
  return Fn(([progress]: [any]) => {
    const lifetime = storage.lifetimes.element(instanceIndex)

    // Map progress (0→1) to segment index (0 = newest, segments-1 = oldest)
    const segIdx = progress.mul(float(segments - 1)).floor()

    // Read from ring buffer: head is the most recent write position
    // We go backwards from head to read chronological history
    const baseIdx = instanceIndex.mul(segments)
    const readOffset = uniforms.trailHead
      .sub(segIdx)
      .add(float(segments))
      .mod(float(segments))
      .floor()
    const readIdx = baseIdx.add(readOffset)

    const trailPos = storage.trailHistory!.element(readIdx)

    // Dead particles: collapse offscreen
    return lifetime.greaterThan(0).select(trailPos, vec3(0, -1000, 0))
  })
}
