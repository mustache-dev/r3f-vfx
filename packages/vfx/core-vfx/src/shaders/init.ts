import { Fn, float, vec3, instanceIndex } from 'three/tsl'
import type { ParticleStorageArrays } from './types'

/**
 * Creates the initialization compute shader that sets all particles to dead state.
 * This should be run once when the particle system is created.
 */
export const createInitCompute = (storage: ParticleStorageArrays, maxParticles: number) => {
  return Fn(() => {
    const position = storage.positions.element(instanceIndex)
    const velocity = storage.velocities.element(instanceIndex)
    const lifetime = storage.lifetimes.element(instanceIndex)
    const fadeRate = storage.fadeRates.element(instanceIndex)
    const particleSize = storage.particleSizes.element(instanceIndex)
    // Optional arrays (null when feature unused)
    const particleRotation = storage.particleRotations?.element(instanceIndex)
    const colorStart = storage.particleColorStarts?.element(instanceIndex)
    const colorEnd = storage.particleColorEnds?.element(instanceIndex)

    // Initialize all particles as dead (below visible range)
    position.assign(vec3(0, -1000, 0))
    velocity.assign(vec3(0, 0, 0))
    lifetime.assign(float(0))
    fadeRate.assign(float(0))
    particleSize.assign(float(0))

    // Only initialize optional arrays if they exist
    if (particleRotation) {
      particleRotation.assign(vec3(0, 0, 0))
    }
    if (colorStart && colorEnd) {
      colorStart.assign(vec3(1, 1, 1))
      colorEnd.assign(vec3(1, 1, 1))
    }
  })().compute(maxParticles)
}
