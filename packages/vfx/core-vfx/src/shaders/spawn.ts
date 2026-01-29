import {
  Fn,
  If,
  float,
  vec3,
  hash,
  mix,
  floor,
  instanceIndex,
  cos,
  sin,
  sqrt,
  acos,
  PI,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { ParticleStorageArrays, ParticleUniforms } from './types'
import { selectColor } from './helpers'

/**
 * Creates the spawn compute shader that initializes new particles.
 * This runs when particles need to be spawned, using spawnIndexStart/End uniforms
 * to determine which particle slots to initialize.
 */
export const createSpawnCompute = (
  storage: ParticleStorageArrays,
  uniforms: ParticleUniforms,
  maxParticles: number
) => {
  return Fn(() => {
    const idx = float(instanceIndex)
    const startIdx = uniforms.spawnIndexStart
    const endIdx = uniforms.spawnIndexEnd
    const seed = uniforms.spawnSeed

    // Handle wraparound case (when end < start due to circular buffer)
    const inRange = startIdx
      .lessThan(endIdx)
      .select(
        idx.greaterThanEqual(startIdx).and(idx.lessThan(endIdx)),
        idx.greaterThanEqual(startIdx).or(idx.lessThan(endIdx))
      )

    If(inRange, () => {
      const position = storage.positions.element(instanceIndex)
      const velocity = storage.velocities.element(instanceIndex)
      const lifetime = storage.lifetimes.element(instanceIndex)
      const fadeRate = storage.fadeRates.element(instanceIndex)
      const particleSize = storage.particleSizes.element(instanceIndex)
      // Optional arrays (null when feature unused)
      const particleRotation = storage.particleRotations?.element(instanceIndex)
      const pColorStart = storage.particleColorStarts?.element(instanceIndex)
      const pColorEnd = storage.particleColorEnds?.element(instanceIndex)

      // Unique random per particle using hash function
      const particleSeed = idx.add(seed)
      const randDirX = hash(particleSeed.add(333))
      const randDirY = hash(particleSeed.add(444))
      const randDirZ = hash(particleSeed.add(555))
      const randFade = hash(particleSeed.add(666))
      const randColorStart = hash(particleSeed.add(777))
      const randColorEnd = hash(particleSeed.add(888))
      const randSize = hash(particleSeed.add(999))
      const randSpeed = hash(particleSeed.add(1111))
      const randRotationX = hash(particleSeed.add(2222))
      const randRotationY = hash(particleSeed.add(3333))
      const randRotationZ = hash(particleSeed.add(4444))
      const randPosX = hash(particleSeed.add(5555))
      const randPosY = hash(particleSeed.add(6666))
      const randPosZ = hash(particleSeed.add(7777))
      const randRadius = hash(particleSeed.add(8880))
      const randTheta = hash(particleSeed.add(9990))
      const randPhi = hash(particleSeed.add(10100))
      const randHeight = hash(particleSeed.add(11110))

      // Calculate position based on emitter shape
      const shapeType = uniforms.emitterShapeType
      const radiusInner = uniforms.emitterRadiusInner
      const radiusOuter = uniforms.emitterRadiusOuter
      const coneAngle = uniforms.emitterAngle
      const heightMin = uniforms.emitterHeightMin
      const heightMax = uniforms.emitterHeightMax
      const surfaceOnly = uniforms.emitterSurfaceOnly
      const emitDir = uniforms.emitterDir

      // Theta: full rotation around Y axis (0 to 2*PI)
      const theta = randTheta.mul(PI.mul(2))

      // For sphere: phi is the vertical angle (0 to PI for full sphere)
      // Using acos for uniform distribution on sphere surface
      const phi = acos(float(1).sub(randPhi.mul(2)))

      // Radius interpolation (inner to outer, with optional surface-only)
      // For volume: use cube root for uniform volume distribution
      // For surface: use outer radius only
      const radiusT = surfaceOnly.greaterThan(0.5).select(
        float(1),
        randRadius.pow(float(1).div(3)) // Cube root for uniform volume
      )
      const radius = mix(radiusInner, radiusOuter, radiusT)

      // === SHAPE CALCULATIONS ===

      // Pre-compute rotation values for emitDir (rotate from Y-up to emitDir)
      // Dot product with Y axis
      const cosAngleVal = emitDir.y
      // Cross product: (0,1,0) × emitDir = (-emitDir.z, 0, emitDir.x)
      const axisX = emitDir.z.negate()
      const axisZ = emitDir.x
      const axisLenSq = axisX.mul(axisX).add(axisZ.mul(axisZ))
      const axisLen = sqrt(axisLenSq.max(0.0001)) // Avoid division by zero
      const kx = axisX.div(axisLen)
      const kz = axisZ.div(axisLen)
      const sinAngleVal = axisLen
      const oneMinusCos = float(1).sub(cosAngleVal)

      // Helper: rotate a vector from Y-up to align with emitDir
      // Using Rodrigues' rotation formula simplified for rotating from (0,1,0)
      const rotateToEmitDir = (localPos: Node) => {
        // k × localPos where k = (kx, 0, kz)
        const crossX = kz.mul(localPos.y).negate()
        const crossY = kz.mul(localPos.x).sub(kx.mul(localPos.z))
        const crossZ = kx.mul(localPos.y)

        // k · localPos
        const kDotV = kx.mul(localPos.x).add(kz.mul(localPos.z))

        // Rodrigues rotation
        const rotatedX = localPos.x
          .mul(cosAngleVal)
          .add(crossX.mul(sinAngleVal))
          .add(kx.mul(kDotV).mul(oneMinusCos))
        const rotatedY = localPos.y
          .mul(cosAngleVal)
          .add(crossY.mul(sinAngleVal))
        const rotatedZ = localPos.z
          .mul(cosAngleVal)
          .add(crossZ.mul(sinAngleVal))
          .add(kz.mul(kDotV).mul(oneMinusCos))

        // If emitDir is nearly parallel to Y, use simpler logic
        return cosAngleVal
          .greaterThan(0.999)
          .select(
            localPos,
            cosAngleVal
              .lessThan(-0.999)
              .select(
                vec3(localPos.x, localPos.y.negate(), localPos.z),
                vec3(rotatedX, rotatedY, rotatedZ)
              )
          )
      }

      // BOX (shape 1): use startPosition ranges
      const boxOffsetX = mix(
        uniforms.startPosMinX,
        uniforms.startPosMaxX,
        randPosX
      )
      const boxOffsetY = mix(
        uniforms.startPosMinY,
        uniforms.startPosMaxY,
        randPosY
      )
      const boxOffsetZ = mix(
        uniforms.startPosMinZ,
        uniforms.startPosMaxZ,
        randPosZ
      )
      const boxPos = vec3(boxOffsetX, boxOffsetY, boxOffsetZ)

      // SPHERE (shape 2): spherical coordinates
      const sphereX = radius.mul(sin(phi)).mul(cos(theta))
      const sphereY = radius.mul(cos(phi))
      const sphereZ = radius.mul(sin(phi)).mul(sin(theta))
      const spherePos = vec3(sphereX, sphereY, sphereZ)

      // CONE (shape 3): emit within cone angle, with height
      // Cone points along emitDir, angle is half-angle from center
      const coneH = mix(heightMin, heightMax, randHeight)
      const coneR = coneH.mul(sin(coneAngle)).mul(radiusT)
      const coneLocalX = coneR.mul(cos(theta))
      const coneLocalY = coneH.mul(cos(coneAngle))
      const coneLocalZ = coneR.mul(sin(theta))
      const conePos = rotateToEmitDir(vec3(coneLocalX, coneLocalY, coneLocalZ))

      // DISK (shape 4): flat circle on XZ plane, then rotated to emitDir
      const diskR = surfaceOnly.greaterThan(0.5).select(
        radiusOuter,
        mix(radiusInner, radiusOuter, sqrt(randRadius)) // sqrt for uniform area distribution
      )
      const diskLocalX = diskR.mul(cos(theta))
      const diskLocalZ = diskR.mul(sin(theta))
      // Disk is in XZ plane (Y=0), rotate so Y-up becomes emitDir
      const diskPos = rotateToEmitDir(vec3(diskLocalX, float(0), diskLocalZ))

      // EDGE (shape 5): line between startPosMin and startPosMax
      const edgeT = randPosX
      const edgePos = vec3(
        mix(uniforms.startPosMinX, uniforms.startPosMaxX, edgeT),
        mix(uniforms.startPosMinY, uniforms.startPosMaxY, edgeT),
        mix(uniforms.startPosMinZ, uniforms.startPosMaxZ, edgeT)
      )

      // POINT (shape 0): no offset
      const pointPos = vec3(0, 0, 0)

      // Select position based on shape type
      const shapeOffset = shapeType.lessThan(0.5).select(
        pointPos, // 0: POINT
        shapeType.lessThan(1.5).select(
          boxPos, // 1: BOX
          shapeType.lessThan(2.5).select(
            spherePos, // 2: SPHERE
            shapeType.lessThan(3.5).select(
              conePos, // 3: CONE
              shapeType.lessThan(4.5).select(
                diskPos, // 4: DISK
                edgePos // 5: EDGE
              )
            )
          )
        )
      )

      position.assign(uniforms.spawnPosition.add(shapeOffset))

      // Random fade rate (needed before velocity calc for attractToCenter)
      const randomFade = mix(
        uniforms.lifetimeMin,
        uniforms.lifetimeMax,
        randFade
      )
      fadeRate.assign(randomFade)

      // Velocity calculation
      const useAttractToCenter = uniforms.attractToCenter.greaterThan(0.5)

      // AttractToCenter: velocity = -shapeOffset * fadeRate
      // This makes particles reach center exactly when they die (velocity in units/sec)
      const attractVelocity = shapeOffset.negate().mul(randomFade)

      // Normal velocity: random direction * speed OR start position as direction
      const useStartPosAsDir =
        uniforms.startPositionAsDirection.greaterThan(0.5)

      // Random direction (default behavior)
      const dirX = mix(uniforms.dirMinX, uniforms.dirMaxX, randDirX)
      const dirY = mix(uniforms.dirMinY, uniforms.dirMaxY, randDirY)
      const dirZ = mix(uniforms.dirMinZ, uniforms.dirMaxZ, randDirZ)
      const randomDirVec = vec3(dirX, dirY, dirZ)
      const randomDirLength = randomDirVec.length()
      const randomDir = randomDirLength
        .greaterThan(0.001)
        .select(randomDirVec.div(randomDirLength), vec3(0, 0, 0))

      // Start position as direction (normalized shapeOffset)
      const startPosLength = shapeOffset.length()
      const startPosDir = startPosLength
        .greaterThan(0.001)
        .select(shapeOffset.div(startPosLength), vec3(0, 0, 0))

      // Select direction based on mode
      const dir = useStartPosAsDir.select(startPosDir, randomDir)

      const randomSpeed = mix(uniforms.speedMin, uniforms.speedMax, randSpeed)
      const normalVelocity = dir.mul(randomSpeed)

      // Select velocity mode
      velocity.assign(
        useAttractToCenter.select(attractVelocity, normalVelocity)
      )

      // Random size between min and max
      const randomSize = mix(uniforms.sizeMin, uniforms.sizeMax, randSize)
      particleSize.assign(randomSize)

      // Random 3D rotation between min and max for each axis (only if rotation array exists)
      if (particleRotation) {
        const rotX = mix(
          uniforms.rotationMinX,
          uniforms.rotationMaxX,
          randRotationX
        )
        const rotY = mix(
          uniforms.rotationMinY,
          uniforms.rotationMaxY,
          randRotationY
        )
        const rotZ = mix(
          uniforms.rotationMinZ,
          uniforms.rotationMaxZ,
          randRotationZ
        )
        particleRotation.assign(vec3(rotX, rotY, rotZ))
      }

      // Pick random start/end colors only if per-particle color arrays exist
      if (pColorStart && pColorEnd) {
        const startColorIdx = floor(
          randColorStart.mul(uniforms.colorStartCount)
        )
        const selectedStartColor = selectColor(
          startColorIdx,
          uniforms.colorStart0,
          uniforms.colorStart1,
          uniforms.colorStart2,
          uniforms.colorStart3,
          uniforms.colorStart4,
          uniforms.colorStart5,
          uniforms.colorStart6,
          uniforms.colorStart7
        )
        pColorStart.assign(selectedStartColor)

        const endColorIdx = floor(randColorEnd.mul(uniforms.colorEndCount))
        const selectedEndColor = selectColor(
          endColorIdx,
          uniforms.colorEnd0,
          uniforms.colorEnd1,
          uniforms.colorEnd2,
          uniforms.colorEnd3,
          uniforms.colorEnd4,
          uniforms.colorEnd5,
          uniforms.colorEnd6,
          uniforms.colorEnd7
        )
        pColorEnd.assign(selectedEndColor)
      }

      lifetime.assign(float(1))
    })
  })().compute(maxParticles)
}
