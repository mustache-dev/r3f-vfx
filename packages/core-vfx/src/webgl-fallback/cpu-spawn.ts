import type { ParticleUniforms } from '../shaders/types'
import type { CPUStorageArrays } from './buffer-utils'
import { hash } from './hash'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type U = Record<string, { value: any }>

/**
 * CPU equivalent of shaders/spawn.ts.
 * Spawns new particles in the [spawnIndexStart, spawnIndexEnd) range
 * with shapes, velocity, size, rotation, and color randomization.
 */
export const cpuSpawn = (
  cpu: CPUStorageArrays,
  uniforms: ParticleUniforms,
  maxParticles: number
): void => {
  const u = uniforms as unknown as U
  const startIdx = u.spawnIndexStart.value as number
  const endIdx = u.spawnIndexEnd.value as number
  const seed = u.spawnSeed.value as number

  // Only iterate the spawn range instead of all maxParticles
  const count =
    startIdx < endIdx ? endIdx - startIdx : maxParticles - startIdx + endIdx

  for (let j = 0; j < count; j++) {
    const i = (startIdx + j) % maxParticles
    const i3 = i * 3
    const particleSeed = i + seed

    // Random values per particle
    const randDirX = hash(particleSeed + 333)
    const randDirY = hash(particleSeed + 444)
    const randDirZ = hash(particleSeed + 555)
    const randFade = hash(particleSeed + 666)
    const randColorStart = hash(particleSeed + 777)
    const randColorEnd = hash(particleSeed + 888)
    const randSize = hash(particleSeed + 999)
    const randSpeed = hash(particleSeed + 1111)
    const randRotationX = hash(particleSeed + 2222)
    const randRotationY = hash(particleSeed + 3333)
    const randRotationZ = hash(particleSeed + 4444)
    const randPosX = hash(particleSeed + 5555)
    const randPosY = hash(particleSeed + 6666)
    const randPosZ = hash(particleSeed + 7777)
    const randRadius = hash(particleSeed + 8880)
    const randTheta = hash(particleSeed + 9990)
    const randPhi = hash(particleSeed + 10100)
    const randHeight = hash(particleSeed + 11110)

    // Emitter shape parameters
    const shapeType = u.emitterShapeType.value as number
    const radiusInner = u.emitterRadiusInner.value as number
    const radiusOuter = u.emitterRadiusOuter.value as number
    const coneAngle = u.emitterAngle.value as number
    const heightMin = u.emitterHeightMin.value as number
    const heightMax = u.emitterHeightMax.value as number
    const surfaceOnly = u.emitterSurfaceOnly.value as number
    const emitDirX = u.emitterDir.value.x as number
    const emitDirY = u.emitterDir.value.y as number
    const emitDirZ = u.emitterDir.value.z as number

    // Theta: full rotation around Y axis
    const theta = randTheta * Math.PI * 2

    // Phi: vertical angle for sphere (uniform distribution)
    const phi = Math.acos(1 - randPhi * 2)

    // Radius interpolation
    const radiusT = surfaceOnly > 0.5 ? 1 : Math.pow(randRadius, 1 / 3)
    const radius = radiusInner + (radiusOuter - radiusInner) * radiusT

    // Pre-compute rotation values for emitDir (rotate from Y-up to emitDir)
    const cosAngleVal = emitDirY
    const axisX = -emitDirZ
    const axisZ = emitDirX
    const axisLenSq = axisX * axisX + axisZ * axisZ
    const axisLen = Math.sqrt(Math.max(axisLenSq, 0.0001))
    const kx = axisX / axisLen
    const kz = axisZ / axisLen
    const sinAngleVal = axisLen
    const oneMinusCos = 1 - cosAngleVal

    // Rodrigues rotation helper
    const rotateToEmitDir = (
      lx: number,
      ly: number,
      lz: number
    ): [number, number, number] => {
      if (cosAngleVal > 0.999) return [lx, ly, lz]
      if (cosAngleVal < -0.999) return [lx, -ly, lz]

      const crossX = -(kz * ly)
      const crossY = kz * lx - kx * lz
      const crossZ = kx * ly
      const kDotV = kx * lx + kz * lz

      return [
        lx * cosAngleVal + crossX * sinAngleVal + kx * kDotV * oneMinusCos,
        ly * cosAngleVal + crossY * sinAngleVal,
        lz * cosAngleVal + crossZ * sinAngleVal + kz * kDotV * oneMinusCos,
      ]
    }

    // Shape offset calculation
    let shapeX = 0
    let shapeY = 0
    let shapeZ = 0

    if (shapeType < 0.5) {
      // POINT (0): no offset
    } else if (shapeType < 1.5) {
      // BOX (1): use startPosition ranges
      const startPosMinX = u.startPosMinX.value as number
      const startPosMaxX = u.startPosMaxX.value as number
      const startPosMinY = u.startPosMinY.value as number
      const startPosMaxY = u.startPosMaxY.value as number
      const startPosMinZ = u.startPosMinZ.value as number
      const startPosMaxZ = u.startPosMaxZ.value as number
      shapeX = startPosMinX + (startPosMaxX - startPosMinX) * randPosX
      shapeY = startPosMinY + (startPosMaxY - startPosMinY) * randPosY
      shapeZ = startPosMinZ + (startPosMaxZ - startPosMinZ) * randPosZ
    } else if (shapeType < 2.5) {
      // SPHERE (2): spherical coordinates
      shapeX = radius * Math.sin(phi) * Math.cos(theta)
      shapeY = radius * Math.cos(phi)
      shapeZ = radius * Math.sin(phi) * Math.sin(theta)
    } else if (shapeType < 3.5) {
      // CONE (3): emit within cone angle, with height
      const coneH = heightMin + (heightMax - heightMin) * randHeight
      const coneR = coneH * Math.sin(coneAngle) * radiusT
      const coneLocalX = coneR * Math.cos(theta)
      const coneLocalY = coneH * Math.cos(coneAngle)
      const coneLocalZ = coneR * Math.sin(theta)
      ;[shapeX, shapeY, shapeZ] = rotateToEmitDir(
        coneLocalX,
        coneLocalY,
        coneLocalZ
      )
    } else if (shapeType < 4.5) {
      // DISK (4): flat circle on XZ plane, rotated to emitDir
      const diskR =
        surfaceOnly > 0.5
          ? radiusOuter
          : radiusInner + (radiusOuter - radiusInner) * Math.sqrt(randRadius)
      const diskLocalX = diskR * Math.cos(theta)
      const diskLocalZ = diskR * Math.sin(theta)
      ;[shapeX, shapeY, shapeZ] = rotateToEmitDir(diskLocalX, 0, diskLocalZ)
    } else {
      // EDGE (5): line between startPosMin and startPosMax
      const startPosMinX = u.startPosMinX.value as number
      const startPosMaxX = u.startPosMaxX.value as number
      const startPosMinY = u.startPosMinY.value as number
      const startPosMaxY = u.startPosMaxY.value as number
      const startPosMinZ = u.startPosMinZ.value as number
      const startPosMaxZ = u.startPosMaxZ.value as number
      const edgeT = randPosX
      shapeX = startPosMinX + (startPosMaxX - startPosMinX) * edgeT
      shapeY = startPosMinY + (startPosMaxY - startPosMinY) * edgeT
      shapeZ = startPosMinZ + (startPosMaxZ - startPosMinZ) * edgeT
    }

    // Position = spawnPosition + shapeOffset
    const spawnX = u.spawnPosition.value.x as number
    const spawnY = u.spawnPosition.value.y as number
    const spawnZ = u.spawnPosition.value.z as number
    cpu.positions[i3] = spawnX + shapeX
    cpu.positions[i3 + 1] = spawnY + shapeY
    cpu.positions[i3 + 2] = spawnZ + shapeZ

    // Fade rate (needed before velocity calc for attractToCenter)
    const lifetimeMin = u.lifetimeMin.value as number
    const lifetimeMax = u.lifetimeMax.value as number
    const randomFade = lifetimeMin + (lifetimeMax - lifetimeMin) * randFade
    cpu.fadeRates[i] = randomFade

    // Velocity
    const useAttractToCenter = (u.attractToCenter.value as number) > 0.5

    let vx: number
    let vy: number
    let vz: number

    if (useAttractToCenter) {
      // velocity = -shapeOffset * fadeRate
      vx = -shapeX * randomFade
      vy = -shapeY * randomFade
      vz = -shapeZ * randomFade
    } else {
      const useStartPosAsDir =
        (u.startPositionAsDirection.value as number) > 0.5

      let dirX: number
      let dirY: number
      let dirZ: number

      if (useStartPosAsDir) {
        // Use shapeOffset as direction
        const len = Math.sqrt(
          shapeX * shapeX + shapeY * shapeY + shapeZ * shapeZ
        )
        if (len > 0.001) {
          dirX = shapeX / len
          dirY = shapeY / len
          dirZ = shapeZ / len
        } else {
          dirX = 0
          dirY = 0
          dirZ = 0
        }
      } else {
        // Random direction
        const dirMinX = u.dirMinX.value as number
        const dirMaxX = u.dirMaxX.value as number
        const dirMinY = u.dirMinY.value as number
        const dirMaxY = u.dirMaxY.value as number
        const dirMinZ = u.dirMinZ.value as number
        const dirMaxZ = u.dirMaxZ.value as number
        const rdx = dirMinX + (dirMaxX - dirMinX) * randDirX
        const rdy = dirMinY + (dirMaxY - dirMinY) * randDirY
        const rdz = dirMinZ + (dirMaxZ - dirMinZ) * randDirZ
        const len = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz)
        if (len > 0.001) {
          dirX = rdx / len
          dirY = rdy / len
          dirZ = rdz / len
        } else {
          dirX = 0
          dirY = 0
          dirZ = 0
        }
      }

      const speedMin = u.speedMin.value as number
      const speedMax = u.speedMax.value as number
      const randomSpeed = speedMin + (speedMax - speedMin) * randSpeed
      vx = dirX * randomSpeed
      vy = dirY * randomSpeed
      vz = dirZ * randomSpeed
    }

    cpu.velocities[i3] = vx
    cpu.velocities[i3 + 1] = vy
    cpu.velocities[i3 + 2] = vz

    // Size
    const sizeMin = u.sizeMin.value as number
    const sizeMax = u.sizeMax.value as number
    cpu.particleSizes[i] = sizeMin + (sizeMax - sizeMin) * randSize

    // Rotation (optional)
    if (cpu.particleRotations) {
      const rotMinX = u.rotationMinX.value as number
      const rotMaxX = u.rotationMaxX.value as number
      const rotMinY = u.rotationMinY.value as number
      const rotMaxY = u.rotationMaxY.value as number
      const rotMinZ = u.rotationMinZ.value as number
      const rotMaxZ = u.rotationMaxZ.value as number
      cpu.particleRotations[i3] = rotMinX + (rotMaxX - rotMinX) * randRotationX
      cpu.particleRotations[i3 + 1] =
        rotMinY + (rotMaxY - rotMinY) * randRotationY
      cpu.particleRotations[i3 + 2] =
        rotMinZ + (rotMaxZ - rotMinZ) * randRotationZ
    }

    // Colors (optional)
    if (cpu.particleColorStarts && cpu.particleColorEnds) {
      const startColorCount = u.colorStartCount.value as number
      const endColorCount = u.colorEndCount.value as number

      // Select start color
      const startColorIdx = Math.floor(randColorStart * startColorCount)
      const sc = getColor(u, 'colorStart', startColorIdx)
      cpu.particleColorStarts[i3] = sc[0]
      cpu.particleColorStarts[i3 + 1] = sc[1]
      cpu.particleColorStarts[i3 + 2] = sc[2]

      // Select end color
      const endColorIdx = Math.floor(randColorEnd * endColorCount)
      const ec = getColor(u, 'colorEnd', endColorIdx)
      cpu.particleColorEnds[i3] = ec[0]
      cpu.particleColorEnds[i3 + 1] = ec[1]
      cpu.particleColorEnds[i3 + 2] = ec[2]
    }

    // Lifetime = 1 (full life)
    cpu.lifetimes[i] = 1
  }
}

/** Select color from uniform array by index (up to 8 colors). */
const getColor = (
  u: U,
  prefix: string,
  idx: number
): [number, number, number] => {
  const clampedIdx = Math.min(Math.max(Math.floor(idx), 0), 7)
  const color = u[`${prefix}${clampedIdx}`]?.value
  if (!color) return [1, 1, 1]
  return [color.r as number, color.g as number, color.b as number]
}
