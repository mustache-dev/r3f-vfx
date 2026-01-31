import * as THREE from 'three/webgpu'
import { uniform } from 'three/tsl'
import type { NormalizedParticleProps } from './types'
import type { ParticleUniforms } from './shaders/types'
import { MAX_ATTRACTORS } from './constants'
import type { AttractorConfig } from './types'
import {
  toRange,
  toRotation3D,
  hexToRgb,
  lifetimeToFadeRate,
  easingToType,
  axisToNumber,
} from './utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UniformAccessor = Record<string, { value: any }>

export function createUniforms(
  props: NormalizedParticleProps
): ParticleUniforms {
  return {
    sizeMin: uniform(props.sizeRange[0]),
    sizeMax: uniform(props.sizeRange[1]),
    fadeSizeStart: uniform(props.fadeSizeRange[0]),
    fadeSizeEnd: uniform(props.fadeSizeRange[1]),
    fadeOpacityStart: uniform(props.fadeOpacityRange[0]),
    fadeOpacityEnd: uniform(props.fadeOpacityRange[1]),
    gravity: uniform(new THREE.Vector3(...props.gravity)),
    frictionIntensityStart: uniform(props.frictionIntensityRange[0]),
    frictionIntensityEnd: uniform(props.frictionIntensityRange[1]),
    frictionEasingType: uniform(props.frictionEasingType),
    speedMin: uniform(props.speedRange[0]),
    speedMax: uniform(props.speedRange[1]),
    lifetimeMin: uniform(lifetimeToFadeRate(props.lifetimeRange[1])),
    lifetimeMax: uniform(lifetimeToFadeRate(props.lifetimeRange[0])),
    deltaTime: uniform(0.016),
    // 3D direction ranges
    dirMinX: uniform(props.direction3D[0][0]),
    dirMaxX: uniform(props.direction3D[0][1]),
    dirMinY: uniform(props.direction3D[1][0]),
    dirMaxY: uniform(props.direction3D[1][1]),
    dirMinZ: uniform(props.direction3D[2][0]),
    dirMaxZ: uniform(props.direction3D[2][1]),
    // 3D start position offset ranges
    startPosMinX: uniform(props.startPosition3D[0][0]),
    startPosMaxX: uniform(props.startPosition3D[0][1]),
    startPosMinY: uniform(props.startPosition3D[1][0]),
    startPosMaxY: uniform(props.startPosition3D[1][1]),
    startPosMinZ: uniform(props.startPosition3D[2][0]),
    startPosMaxZ: uniform(props.startPosition3D[2][1]),
    spawnPosition: uniform(new THREE.Vector3(...props.position)),
    spawnIndexStart: uniform(0),
    spawnIndexEnd: uniform(0),
    spawnSeed: uniform(0),
    intensity: uniform(props.intensity),
    // 3D rotation ranges
    rotationMinX: uniform(props.rotation3D[0][0]),
    rotationMaxX: uniform(props.rotation3D[0][1]),
    rotationMinY: uniform(props.rotation3D[1][0]),
    rotationMaxY: uniform(props.rotation3D[1][1]),
    rotationMinZ: uniform(props.rotation3D[2][0]),
    rotationMaxZ: uniform(props.rotation3D[2][1]),
    // 3D rotation speed ranges
    rotationSpeedMinX: uniform(props.rotationSpeed3D[0][0]),
    rotationSpeedMaxX: uniform(props.rotationSpeed3D[0][1]),
    rotationSpeedMinY: uniform(props.rotationSpeed3D[1][0]),
    rotationSpeedMaxY: uniform(props.rotationSpeed3D[1][1]),
    rotationSpeedMinZ: uniform(props.rotationSpeed3D[2][0]),
    rotationSpeedMaxZ: uniform(props.rotationSpeed3D[2][1]),
    // Color arrays (8 colors max each)
    colorStartCount: uniform(props.colorStartCount),
    colorEndCount: uniform(props.colorEndCount),
    colorStart0: uniform(new THREE.Color(...props.startColors[0])),
    colorStart1: uniform(new THREE.Color(...props.startColors[1])),
    colorStart2: uniform(new THREE.Color(...props.startColors[2])),
    colorStart3: uniform(new THREE.Color(...props.startColors[3])),
    colorStart4: uniform(new THREE.Color(...props.startColors[4])),
    colorStart5: uniform(new THREE.Color(...props.startColors[5])),
    colorStart6: uniform(new THREE.Color(...props.startColors[6])),
    colorStart7: uniform(new THREE.Color(...props.startColors[7])),
    colorEnd0: uniform(new THREE.Color(...props.endColors[0])),
    colorEnd1: uniform(new THREE.Color(...props.endColors[1])),
    colorEnd2: uniform(new THREE.Color(...props.endColors[2])),
    colorEnd3: uniform(new THREE.Color(...props.endColors[3])),
    colorEnd4: uniform(new THREE.Color(...props.endColors[4])),
    colorEnd5: uniform(new THREE.Color(...props.endColors[5])),
    colorEnd6: uniform(new THREE.Color(...props.endColors[6])),
    colorEnd7: uniform(new THREE.Color(...props.endColors[7])),
    // Emitter shape uniforms
    emitterShapeType: uniform(props.emitterShape),
    emitterRadiusInner: uniform(props.emitterRadiusRange[0]),
    emitterRadiusOuter: uniform(props.emitterRadiusRange[1]),
    emitterAngle: uniform(props.emitterAngle),
    emitterHeightMin: uniform(props.emitterHeightRange[0]),
    emitterHeightMax: uniform(props.emitterHeightRange[1]),
    emitterSurfaceOnly: uniform(props.emitterSurfaceOnly ? 1 : 0),
    emitterDir: uniform(
      new THREE.Vector3(...props.emitterDirection).normalize()
    ),
    // Turbulence uniforms
    turbulenceIntensity: uniform(props.turbulence?.intensity ?? 0),
    turbulenceFrequency: uniform(props.turbulence?.frequency ?? 1),
    turbulenceSpeed: uniform(props.turbulence?.speed ?? 1),
    turbulenceTime: uniform(0),
    // Attractor uniforms (up to 4)
    attractorCount: uniform(0),
    attractor0Pos: uniform(new THREE.Vector3(0, 0, 0)),
    attractor0Strength: uniform(0),
    attractor0Radius: uniform(1),
    attractor0Type: uniform(0),
    attractor0Axis: uniform(new THREE.Vector3(0, 1, 0)),
    attractor1Pos: uniform(new THREE.Vector3(0, 0, 0)),
    attractor1Strength: uniform(0),
    attractor1Radius: uniform(1),
    attractor1Type: uniform(0),
    attractor1Axis: uniform(new THREE.Vector3(0, 1, 0)),
    attractor2Pos: uniform(new THREE.Vector3(0, 0, 0)),
    attractor2Strength: uniform(0),
    attractor2Radius: uniform(1),
    attractor2Type: uniform(0),
    attractor2Axis: uniform(new THREE.Vector3(0, 1, 0)),
    attractor3Pos: uniform(new THREE.Vector3(0, 0, 0)),
    attractor3Strength: uniform(0),
    attractor3Radius: uniform(1),
    attractor3Type: uniform(0),
    attractor3Axis: uniform(new THREE.Vector3(0, 1, 0)),
    // Simple attract to center
    attractToCenter: uniform(props.attractToCenter ? 1 : 0),
    // Use start position as direction
    startPositionAsDirection: uniform(props.startPositionAsDirection ? 1 : 0),
    // Soft particles
    softParticlesEnabled: uniform(props.softParticles ? 1 : 0),
    softDistance: uniform(props.softDistance),
    // Curve enabled flags
    velocityCurveEnabled: uniform(0),
    rotationSpeedCurveEnabled: uniform(0),
    fadeSizeCurveEnabled: uniform(0),
    fadeOpacityCurveEnabled: uniform(0),
    // Orient axis
    orientAxisType: uniform(axisToNumber(props.orientAxis)),
    // Stretch by speed
    stretchEnabled: uniform(props.stretchBySpeed ? 1 : 0),
    stretchFactor: uniform(props.stretchBySpeed?.factor ?? 1),
    stretchMax: uniform(props.stretchBySpeed?.maxStretch ?? 5),
    // Collision uniforms
    collisionEnabled: uniform(props.collision ? 1 : 0),
    collisionPlaneY: uniform(props.collision?.plane?.y ?? 0),
    collisionBounce: uniform(props.collision?.bounce ?? 0.3),
    collisionFriction: uniform(props.collision?.friction ?? 0.8),
    collisionDie: uniform(props.collision?.die ? 1 : 0),
    sizeBasedGravity: uniform(props.collision?.sizeBasedGravity ?? 0),
  }
}

export function updateUniforms(
  uniforms: ParticleUniforms,
  props: NormalizedParticleProps
): void {
  const u = uniforms as unknown as UniformAccessor

  // Size
  u.sizeMin.value = props.sizeRange[0]
  u.sizeMax.value = props.sizeRange[1]

  // Fade
  u.fadeSizeStart.value = props.fadeSizeRange[0]
  u.fadeSizeEnd.value = props.fadeSizeRange[1]
  u.fadeOpacityStart.value = props.fadeOpacityRange[0]
  u.fadeOpacityEnd.value = props.fadeOpacityRange[1]

  // Physics
  u.gravity.value.set(...props.gravity)
  u.frictionIntensityStart.value = props.frictionIntensityRange[0]
  u.frictionIntensityEnd.value = props.frictionIntensityRange[1]
  u.frictionEasingType.value = props.frictionEasingType
  u.speedMin.value = props.speedRange[0]
  u.speedMax.value = props.speedRange[1]

  // Lifetime
  u.lifetimeMin.value = lifetimeToFadeRate(props.lifetimeRange[1])
  u.lifetimeMax.value = lifetimeToFadeRate(props.lifetimeRange[0])

  // Direction
  u.dirMinX.value = props.direction3D[0][0]
  u.dirMaxX.value = props.direction3D[0][1]
  u.dirMinY.value = props.direction3D[1][0]
  u.dirMaxY.value = props.direction3D[1][1]
  u.dirMinZ.value = props.direction3D[2][0]
  u.dirMaxZ.value = props.direction3D[2][1]

  // Start position offset
  u.startPosMinX.value = props.startPosition3D[0][0]
  u.startPosMaxX.value = props.startPosition3D[0][1]
  u.startPosMinY.value = props.startPosition3D[1][0]
  u.startPosMaxY.value = props.startPosition3D[1][1]
  u.startPosMinZ.value = props.startPosition3D[2][0]
  u.startPosMaxZ.value = props.startPosition3D[2][1]

  // Rotation
  u.rotationMinX.value = props.rotation3D[0][0]
  u.rotationMaxX.value = props.rotation3D[0][1]
  u.rotationMinY.value = props.rotation3D[1][0]
  u.rotationMaxY.value = props.rotation3D[1][1]
  u.rotationMinZ.value = props.rotation3D[2][0]
  u.rotationMaxZ.value = props.rotation3D[2][1]

  // Rotation speed
  u.rotationSpeedMinX.value = props.rotationSpeed3D[0][0]
  u.rotationSpeedMaxX.value = props.rotationSpeed3D[0][1]
  u.rotationSpeedMinY.value = props.rotationSpeed3D[1][0]
  u.rotationSpeedMaxY.value = props.rotationSpeed3D[1][1]
  u.rotationSpeedMinZ.value = props.rotationSpeed3D[2][0]
  u.rotationSpeedMaxZ.value = props.rotationSpeed3D[2][1]

  // Intensity
  u.intensity.value = props.intensity

  // Colors
  u.colorStartCount.value = props.colorStartCount
  u.colorEndCount.value = props.colorEndCount
  props.startColors.forEach((c: [number, number, number], i: number) => {
    u[`colorStart${i}`]?.value.setRGB(...c)
  })
  props.endColors.forEach((c: [number, number, number], i: number) => {
    u[`colorEnd${i}`]?.value.setRGB(...c)
  })

  // Emitter shape
  u.emitterShapeType.value = props.emitterShape
  u.emitterRadiusInner.value = props.emitterRadiusRange[0]
  u.emitterRadiusOuter.value = props.emitterRadiusRange[1]
  u.emitterAngle.value = props.emitterAngle
  u.emitterHeightMin.value = props.emitterHeightRange[0]
  u.emitterHeightMax.value = props.emitterHeightRange[1]
  u.emitterSurfaceOnly.value = props.emitterSurfaceOnly ? 1 : 0
  u.emitterDir.value.set(...props.emitterDirection).normalize()

  // Turbulence
  u.turbulenceIntensity.value = props.turbulence?.intensity ?? 0
  u.turbulenceFrequency.value = props.turbulence?.frequency ?? 1
  u.turbulenceSpeed.value = props.turbulence?.speed ?? 1

  // Attractors
  const attractorList = props.attractors ?? []
  u.attractorCount.value = Math.min(attractorList.length, MAX_ATTRACTORS)
  for (let i = 0; i < MAX_ATTRACTORS; i++) {
    const a: AttractorConfig | undefined = attractorList[i]
    if (a) {
      ;(u[`attractor${i}Pos`].value as THREE.Vector3).set(
        ...(a.position ?? [0, 0, 0])
      )
      u[`attractor${i}Strength`].value = a.strength ?? 1
      u[`attractor${i}Radius`].value = a.radius ?? 0
      u[`attractor${i}Type`].value = a.type === 'vortex' ? 1 : 0
      ;(u[`attractor${i}Axis`].value as THREE.Vector3)
        .set(...(a.axis ?? [0, 1, 0]))
        .normalize()
    } else {
      u[`attractor${i}Strength`].value = 0
    }
  }

  // Simple attract to center
  u.attractToCenter.value = props.attractToCenter ? 1 : 0

  // Start position as direction
  u.startPositionAsDirection.value = props.startPositionAsDirection ? 1 : 0

  // Soft particles
  u.softParticlesEnabled.value = props.softParticles ? 1 : 0
  u.softDistance.value = props.softDistance

  // Orient axis
  u.orientAxisType.value = axisToNumber(props.orientAxis)

  // Stretch by speed
  u.stretchEnabled.value = props.stretchBySpeed ? 1 : 0
  u.stretchFactor.value = props.stretchBySpeed?.factor ?? 1
  u.stretchMax.value = props.stretchBySpeed?.maxStretch ?? 5

  // Collision
  u.collisionEnabled.value = props.collision ? 1 : 0
  u.collisionPlaneY.value = props.collision?.plane?.y ?? 0
  u.collisionBounce.value = props.collision?.bounce ?? 0.3
  u.collisionFriction.value = props.collision?.friction ?? 0.8
  u.collisionDie.value = props.collision?.die ? 1 : 0
  u.sizeBasedGravity.value = props.collision?.sizeBasedGravity ?? 0
}

export function updateUniformsPartial(
  uniforms: ParticleUniforms,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawProps: Record<string, any>
): void {
  const u = uniforms as unknown as UniformAccessor

  if ('size' in rawProps) {
    const sizeR = toRange(rawProps.size, [0.1, 0.3])
    u.sizeMin.value = sizeR[0]
    u.sizeMax.value = sizeR[1]
  }
  if ('fadeSize' in rawProps) {
    const fadeSizeR = toRange(rawProps.fadeSize, [1, 0])
    u.fadeSizeStart.value = fadeSizeR[0]
    u.fadeSizeEnd.value = fadeSizeR[1]
  }
  if ('fadeOpacity' in rawProps) {
    const fadeOpacityR = toRange(rawProps.fadeOpacity, [1, 0])
    u.fadeOpacityStart.value = fadeOpacityR[0]
    u.fadeOpacityEnd.value = fadeOpacityR[1]
  }
  if ('fadeSizeCurve' in rawProps) {
    u.fadeSizeCurveEnabled.value = rawProps.fadeSizeCurve ? 1 : 0
  }
  if ('fadeOpacityCurve' in rawProps) {
    u.fadeOpacityCurveEnabled.value = rawProps.fadeOpacityCurve ? 1 : 0
  }
  if ('velocityCurve' in rawProps) {
    u.velocityCurveEnabled.value = rawProps.velocityCurve ? 1 : 0
  }
  if ('rotationSpeedCurve' in rawProps) {
    u.rotationSpeedCurveEnabled.value = rawProps.rotationSpeedCurve ? 1 : 0
  }
  if ('orientAxis' in rawProps) {
    u.orientAxisType.value = axisToNumber(rawProps.orientAxis)
  }
  if ('stretchBySpeed' in rawProps) {
    u.stretchEnabled.value = rawProps.stretchBySpeed ? 1 : 0
    u.stretchFactor.value = rawProps.stretchBySpeed?.factor ?? 1
    u.stretchMax.value = rawProps.stretchBySpeed?.maxStretch ?? 5
  }
  if (
    'gravity' in rawProps &&
    rawProps.gravity &&
    Array.isArray(rawProps.gravity)
  ) {
    u.gravity.value.set(...(rawProps.gravity as [number, number, number]))
  }
  if ('speed' in rawProps) {
    const speedR = toRange(rawProps.speed, [0.1, 0.1])
    u.speedMin.value = speedR[0]
    u.speedMax.value = speedR[1]
  }
  if ('lifetime' in rawProps) {
    const lifetimeR = toRange(rawProps.lifetime, [1, 2])
    u.lifetimeMin.value = 1 / lifetimeR[1]
    u.lifetimeMax.value = 1 / lifetimeR[0]
  }
  if ('friction' in rawProps && rawProps.friction) {
    const frictionR = toRange(rawProps.friction.intensity, [0, 0])
    u.frictionIntensityStart.value = frictionR[0]
    u.frictionIntensityEnd.value = frictionR[1]
    u.frictionEasingType.value = easingToType(rawProps.friction.easing)
  }
  if ('direction' in rawProps) {
    const dir3D = toRotation3D(rawProps.direction)
    u.dirMinX.value = dir3D[0][0]
    u.dirMaxX.value = dir3D[0][1]
    u.dirMinY.value = dir3D[1][0]
    u.dirMaxY.value = dir3D[1][1]
    u.dirMinZ.value = dir3D[2][0]
    u.dirMaxZ.value = dir3D[2][1]
  }
  if ('startPosition' in rawProps) {
    const startPos3D = toRotation3D(rawProps.startPosition)
    u.startPosMinX.value = startPos3D[0][0]
    u.startPosMaxX.value = startPos3D[0][1]
    u.startPosMinY.value = startPos3D[1][0]
    u.startPosMaxY.value = startPos3D[1][1]
    u.startPosMinZ.value = startPos3D[2][0]
    u.startPosMaxZ.value = startPos3D[2][1]
  }
  if ('rotation' in rawProps) {
    const rot3D = toRotation3D(rawProps.rotation)
    u.rotationMinX.value = rot3D[0][0]
    u.rotationMaxX.value = rot3D[0][1]
    u.rotationMinY.value = rot3D[1][0]
    u.rotationMaxY.value = rot3D[1][1]
    u.rotationMinZ.value = rot3D[2][0]
    u.rotationMaxZ.value = rot3D[2][1]
  }
  if ('rotationSpeed' in rawProps) {
    const rotSpeed3D = toRotation3D(rawProps.rotationSpeed)
    u.rotationSpeedMinX.value = rotSpeed3D[0][0]
    u.rotationSpeedMaxX.value = rotSpeed3D[0][1]
    u.rotationSpeedMinY.value = rotSpeed3D[1][0]
    u.rotationSpeedMaxY.value = rotSpeed3D[1][1]
    u.rotationSpeedMinZ.value = rotSpeed3D[2][0]
    u.rotationSpeedMaxZ.value = rotSpeed3D[2][1]
  }
  if ('intensity' in rawProps) {
    u.intensity.value = rawProps.intensity ?? 1
  }
  if ('colorStart' in rawProps && rawProps.colorStart) {
    const sColors = rawProps.colorStart.slice(0, 8).map(hexToRgb)
    while (sColors.length < 8)
      sColors.push(sColors[sColors.length - 1] || [1, 1, 1])
    u.colorStartCount.value = rawProps.colorStart.length
    sColors.forEach((c: [number, number, number], i: number) => {
      if (u[`colorStart${i}`]) u[`colorStart${i}`].value.setRGB(...c)
    })
  }
  if ('colorEnd' in rawProps) {
    const effectiveEndColors = rawProps.colorEnd ||
      rawProps.colorStart || ['#ffffff']
    const eColors = effectiveEndColors.slice(0, 8).map(hexToRgb)
    while (eColors.length < 8)
      eColors.push(eColors[eColors.length - 1] || [1, 1, 1])
    u.colorEndCount.value = effectiveEndColors.length
    eColors.forEach((c: [number, number, number], i: number) => {
      if (u[`colorEnd${i}`]) u[`colorEnd${i}`].value.setRGB(...c)
    })
  }
  if ('emitterShape' in rawProps) {
    u.emitterShapeType.value = rawProps.emitterShape ?? 0
  }
  if ('emitterRadius' in rawProps) {
    const emitterRadiusR = toRange(rawProps.emitterRadius, [0, 1])
    u.emitterRadiusInner.value = emitterRadiusR[0]
    u.emitterRadiusOuter.value = emitterRadiusR[1]
  }
  if ('emitterAngle' in rawProps) {
    u.emitterAngle.value = rawProps.emitterAngle ?? Math.PI / 4
  }
  if ('emitterHeight' in rawProps) {
    const emitterHeightR = toRange(rawProps.emitterHeight, [0, 1])
    u.emitterHeightMin.value = emitterHeightR[0]
    u.emitterHeightMax.value = emitterHeightR[1]
  }
  if ('emitterSurfaceOnly' in rawProps) {
    u.emitterSurfaceOnly.value = rawProps.emitterSurfaceOnly ? 1 : 0
  }
  if (
    'emitterDirection' in rawProps &&
    rawProps.emitterDirection &&
    Array.isArray(rawProps.emitterDirection)
  ) {
    const dir = new THREE.Vector3(
      ...(rawProps.emitterDirection as [number, number, number])
    ).normalize()
    u.emitterDir.value.x = dir.x
    u.emitterDir.value.y = dir.y
    u.emitterDir.value.z = dir.z
  }
  if ('turbulence' in rawProps) {
    u.turbulenceIntensity.value = rawProps.turbulence?.intensity ?? 0
    u.turbulenceFrequency.value = rawProps.turbulence?.frequency ?? 1
    u.turbulenceSpeed.value = rawProps.turbulence?.speed ?? 1
  }
  if ('attractors' in rawProps) {
    const attractorList = rawProps.attractors ?? []
    u.attractorCount.value = Math.min(attractorList.length, MAX_ATTRACTORS)
    for (let i = 0; i < MAX_ATTRACTORS; i++) {
      const a: AttractorConfig | undefined = attractorList[i]
      if (a) {
        ;(u[`attractor${i}Pos`].value as THREE.Vector3).set(
          ...(a.position ?? [0, 0, 0])
        )
        u[`attractor${i}Strength`].value = a.strength ?? 1
        u[`attractor${i}Radius`].value = a.radius ?? 0
        u[`attractor${i}Type`].value = a.type === 'vortex' ? 1 : 0
        ;(u[`attractor${i}Axis`].value as THREE.Vector3)
          .set(...(a.axis ?? [0, 1, 0]))
          .normalize()
      } else {
        u[`attractor${i}Strength`].value = 0
      }
    }
  }
  if ('attractToCenter' in rawProps) {
    u.attractToCenter.value = rawProps.attractToCenter ? 1 : 0
  }
  if ('startPositionAsDirection' in rawProps) {
    u.startPositionAsDirection.value = rawProps.startPositionAsDirection ? 1 : 0
  }
  if ('softParticles' in rawProps) {
    u.softParticlesEnabled.value = rawProps.softParticles ? 1 : 0
  }
  if ('softDistance' in rawProps) {
    u.softDistance.value = rawProps.softDistance ?? 0.5
  }
  if ('collision' in rawProps) {
    u.collisionEnabled.value = rawProps.collision ? 1 : 0
    u.collisionPlaneY.value = rawProps.collision?.plane?.y ?? 0
    u.collisionBounce.value = rawProps.collision?.bounce ?? 0.3
    u.collisionFriction.value = rawProps.collision?.friction ?? 0.8
    u.collisionDie.value = rawProps.collision?.die ? 1 : 0
    u.sizeBasedGravity.value = rawProps.collision?.sizeBasedGravity ?? 0
  }
}

export function updateUniformsCurveFlags(
  uniforms: ParticleUniforms,
  flags: {
    fadeSizeCurveEnabled: boolean
    fadeOpacityCurveEnabled: boolean
    velocityCurveEnabled: boolean
    rotationSpeedCurveEnabled: boolean
  }
): void {
  const u = uniforms as unknown as UniformAccessor
  u.fadeSizeCurveEnabled.value = flags.fadeSizeCurveEnabled ? 1 : 0
  u.fadeOpacityCurveEnabled.value = flags.fadeOpacityCurveEnabled ? 1 : 0
  u.velocityCurveEnabled.value = flags.velocityCurveEnabled ? 1 : 0
  u.rotationSpeedCurveEnabled.value = flags.rotationSpeedCurveEnabled ? 1 : 0
}

export function applySpawnOverrides(
  uniforms: ParticleUniforms,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overrides: Record<string, any> | null
): (() => void) | null {
  if (!overrides) return null

  const u = uniforms as unknown as UniformAccessor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saved: Record<string, any> = {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setUniform = (key: string, value: any) => {
    if (u[key]) {
      saved[key] = u[key].value
      u[key].value = value
    }
  }

  // Size
  if (overrides.size !== undefined) {
    const range = toRange(overrides.size, [0.1, 0.3])
    setUniform('sizeMin', range[0])
    setUniform('sizeMax', range[1])
  }

  // Speed
  if (overrides.speed !== undefined) {
    const range = toRange(overrides.speed, [0.1, 0.1])
    setUniform('speedMin', range[0])
    setUniform('speedMax', range[1])
  }

  // Lifetime
  if (overrides.lifetime !== undefined) {
    const range = toRange(overrides.lifetime, [1, 2])
    setUniform('lifetimeMin', 1 / range[1])
    setUniform('lifetimeMax', 1 / range[0])
  }

  // Direction
  if (overrides.direction !== undefined) {
    const dir3D = toRotation3D(overrides.direction)
    setUniform('dirMinX', dir3D[0][0])
    setUniform('dirMaxX', dir3D[0][1])
    setUniform('dirMinY', dir3D[1][0])
    setUniform('dirMaxY', dir3D[1][1])
    setUniform('dirMinZ', dir3D[2][0])
    setUniform('dirMaxZ', dir3D[2][1])
  }

  // Start position offset
  if (overrides.startPosition !== undefined) {
    const pos3D = toRotation3D(overrides.startPosition)
    setUniform('startPosMinX', pos3D[0][0])
    setUniform('startPosMaxX', pos3D[0][1])
    setUniform('startPosMinY', pos3D[1][0])
    setUniform('startPosMaxY', pos3D[1][1])
    setUniform('startPosMinZ', pos3D[2][0])
    setUniform('startPosMaxZ', pos3D[2][1])
  }

  // Gravity
  if (overrides.gravity !== undefined) {
    saved.gravity = u.gravity.value.clone()
    u.gravity.value.set(...(overrides.gravity as [number, number, number]))
  }

  // Colors
  if (overrides.colorStart !== undefined) {
    const colors = overrides.colorStart.slice(0, 8).map(hexToRgb)
    while (colors.length < 8)
      colors.push(colors[colors.length - 1] || [1, 1, 1])
    setUniform('colorStartCount', overrides.colorStart.length)
    colors.forEach((c: [number, number, number], i: number) => {
      if (u[`colorStart${i}`]) {
        saved[`colorStart${i}`] = u[`colorStart${i}`].value.clone()
        u[`colorStart${i}`].value.setRGB(...c)
      }
    })
  }

  if (overrides.colorEnd !== undefined) {
    const colors = overrides.colorEnd.slice(0, 8).map(hexToRgb)
    while (colors.length < 8)
      colors.push(colors[colors.length - 1] || [1, 1, 1])
    setUniform('colorEndCount', overrides.colorEnd.length)
    colors.forEach((c: [number, number, number], i: number) => {
      if (u[`colorEnd${i}`]) {
        saved[`colorEnd${i}`] = u[`colorEnd${i}`].value.clone()
        u[`colorEnd${i}`].value.setRGB(...c)
      }
    })
  }

  // Rotation
  if (overrides.rotation !== undefined) {
    const rot3D = toRotation3D(overrides.rotation)
    setUniform('rotationMinX', rot3D[0][0])
    setUniform('rotationMaxX', rot3D[0][1])
    setUniform('rotationMinY', rot3D[1][0])
    setUniform('rotationMaxY', rot3D[1][1])
    setUniform('rotationMinZ', rot3D[2][0])
    setUniform('rotationMaxZ', rot3D[2][1])
  }

  if (overrides.emitterShape !== undefined) {
    setUniform('emitterShapeType', overrides.emitterShape)
  }

  // Emitter radius
  if (overrides.emitterRadius !== undefined) {
    const range = toRange(overrides.emitterRadius, [0, 1])
    setUniform('emitterRadiusInner', range[0])
    setUniform('emitterRadiusOuter', range[1])
  }

  // Emitter angle
  if (overrides.emitterAngle !== undefined) {
    setUniform('emitterAngle', overrides.emitterAngle)
  }

  // Emitter height
  if (overrides.emitterHeight !== undefined) {
    const range = toRange(overrides.emitterHeight, [0, 1])
    setUniform('emitterHeightMin', range[0])
    setUniform('emitterHeightMax', range[1])
  }

  // Emitter surface only
  if (overrides.emitterSurfaceOnly !== undefined) {
    setUniform('emitterSurfaceOnly', overrides.emitterSurfaceOnly ? 1 : 0)
  }

  // Emitter direction
  if (overrides.emitterDirection !== undefined) {
    saved.emitterDir = u.emitterDir.value.clone()
    u.emitterDir.value
      .set(...(overrides.emitterDirection as [number, number, number]))
      .normalize()
  }

  // Return restore function
  return () => {
    Object.entries(saved).forEach(([key, value]) => {
      if (u[key]) {
        u[key].value = value
      }
    })
  }
}
