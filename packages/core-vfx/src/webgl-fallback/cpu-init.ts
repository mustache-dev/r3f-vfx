import type { CPUStorageArrays } from './buffer-utils'

/**
 * CPU equivalent of shaders/init.ts.
 * Sets all particles to dead state (below visible range).
 */
export const cpuInit = (cpu: CPUStorageArrays, maxParticles: number): void => {
  // Bulk-fill flat arrays (native optimized)
  cpu.positions.fill(0)
  cpu.velocities.fill(0)
  cpu.lifetimes.fill(0)
  cpu.fadeRates.fill(0)
  cpu.particleSizes.fill(0)
  if (cpu.particleRotations) cpu.particleRotations.fill(0)
  if (cpu.particleColorStarts) cpu.particleColorStarts.fill(1)
  if (cpu.particleColorEnds) cpu.particleColorEnds.fill(1)

  // Set y=-1000 for each particle position (stride 3)
  for (let i = 0; i < maxParticles; i++) {
    cpu.positions[i * 3 + 1] = -1000
  }
}
