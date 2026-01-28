import * as THREE from 'three/webgpu'
import {
  float,
  vec2,
  vec3,
  vec4,
  mix,
  floor,
  mod,
  step,
  texture,
  instanceIndex,
  positionLocal,
  cos,
  sin,
  uv,
  screenUV,
  viewportDepthTexture,
  positionView,
  cameraNear,
  cameraFar,
  clamp,
} from 'three/tsl'
import { Appearance, Lighting } from '../constants'
import type { Node } from 'three/webgpu'
import type { ParticleStorageArrays, ParticleUniforms, MaterialOptions } from './types'

/**
 * Creates the particle material (either SpriteNodeMaterial or MeshNodeMaterial).
 * Returns the material configured for either sprite mode or instanced mesh mode.
 */
export const createParticleMaterial = (
  storage: ParticleStorageArrays,
  uniforms: ParticleUniforms,
  curveTexture: THREE.DataTexture,
  options: MaterialOptions
):
  | THREE.SpriteNodeMaterial
  | THREE.MeshBasicNodeMaterial
  | THREE.MeshStandardNodeMaterial
  | THREE.MeshPhysicalNodeMaterial => {
  const {
    alphaMap,
    flipbook,
    appearance,
    lighting,
    softParticles,
    geometry,
    orientToDirection,
    blending,
    opacityNode,
    colorNode,
    backdropNode,
    alphaTestNode,
    castShadowNode,
  } = options

  const lifetime = storage.lifetimes.element(instanceIndex)
  const particleSize = storage.particleSizes.element(instanceIndex)
  // Optional arrays (null when feature unused) - use defaults
  const particleRotation = storage.particleRotations?.element(instanceIndex) ?? vec3(0, 0, 0)
  const pColorStart = storage.particleColorStarts?.element(instanceIndex)
  const pColorEnd = storage.particleColorEnds?.element(instanceIndex)
  const particlePos = storage.positions.element(instanceIndex)
  const particleVel = storage.velocities.element(instanceIndex)

  const progress = float(1).sub(lifetime)

  // If per-particle colors exist, interpolate between them
  // Otherwise, use uniform colors (single color, no per-particle variation)
  const currentColor =
    pColorStart && pColorEnd
      ? mix(pColorStart, pColorEnd, progress)
      : mix(uniforms.colorStart0, uniforms.colorEnd0, progress)
  const intensifiedColor = currentColor.mul(uniforms.intensity)

  // Sample combined curve texture (R=size, G=opacity, B=velocity, A=rotSpeed)
  const curveSample = texture(curveTexture, vec2(progress, float(0.5)))

  // Size multiplier: use curve if enabled, otherwise interpolate fadeSize prop
  const sizeMultiplier = uniforms.fadeSizeCurveEnabled
    .greaterThan(0.5)
    .select(curveSample.x, mix(uniforms.fadeSizeStart, uniforms.fadeSizeEnd, progress))

  // Opacity multiplier: use curve if enabled, otherwise interpolate fadeOpacity prop
  const opacityMultiplier = uniforms.fadeOpacityCurveEnabled
    .greaterThan(0.5)
    .select(curveSample.y, mix(uniforms.fadeOpacityStart, uniforms.fadeOpacityEnd, progress))

  // Calculate UV - with flipbook support
  let sampleUV = uv()

  if (flipbook && alphaMap) {
    const rows = float(flipbook.rows || 1)
    const columns = float(flipbook.columns || 1)
    const totalFrames = rows.mul(columns)

    const frameIndex = floor(progress.mul(totalFrames).min(totalFrames.sub(1)))

    const col = mod(frameIndex, columns)
    const row = floor(frameIndex.div(columns))

    const scaledUV = uv().div(vec2(columns, rows))
    const offsetX = col.div(columns)
    const offsetY = rows.sub(1).sub(row).div(rows)

    // @ts-expect-error - TSL node type mismatch
    sampleUV = scaledUV.add(vec2(offsetX, offsetY))
  }

  let shapeMask: Node

  if (geometry) {
    shapeMask = float(1)
  } else if (alphaMap) {
    const alphaSample = texture(alphaMap, sampleUV)
    shapeMask = alphaSample.r
  } else {
    const dist = uv().mul(2).sub(1).length()
    switch (appearance) {
      case Appearance.DEFAULT:
        shapeMask = float(1)
        break
      case Appearance.CIRCULAR:
        shapeMask = step(dist, float(1))
        break
      case Appearance.GRADIENT:
      default:
        shapeMask = float(1).sub(dist).max(0)
        break
    }
  }

  const baseOpacity = opacityMultiplier
    .mul(shapeMask)
    .mul(lifetime.greaterThan(0.001).select(float(1), float(0)))

  // Particle data object for function-based nodes
  const particleData = {
    progress,
    lifetime,
    position: particlePos,
    velocity: particleVel,
    size: particleSize,
    rotation: particleRotation,
    colorStart: pColorStart,
    colorEnd: pColorEnd,
    color: currentColor,
    intensifiedColor,
    shapeMask,
    index: instanceIndex,
  }

  // Apply custom opacity node if provided
  let finalOpacity = opacityNode
    ? baseOpacity.mul(typeof opacityNode === 'function' ? opacityNode(particleData) : opacityNode)
    : baseOpacity

  // Soft particles - fade when near scene geometry
  if (softParticles) {
    const sceneDepth = viewportDepthTexture(screenUV).x
    const particleViewZ = positionView.z.negate()
    const near = cameraNear
    const far = cameraFar
    const sceneViewZ = near
      .mul(far)
      .mul(2)
      .div(far.add(near).sub(sceneDepth.mul(2).sub(1).mul(far.sub(near))))
    const depthDiff = sceneViewZ.sub(particleViewZ)
    const softFade = clamp(depthDiff.div(uniforms.softDistance), 0, 1)
    finalOpacity = finalOpacity.mul(softFade)
  }

  if (geometry) {
    // InstancedMesh mode with custom geometry
    let mat:
      | THREE.MeshBasicNodeMaterial
      | THREE.MeshStandardNodeMaterial
      | THREE.MeshPhysicalNodeMaterial
    switch (lighting) {
      case Lighting.BASIC:
        mat = new THREE.MeshBasicNodeMaterial()
        break
      case Lighting.PHYSICAL:
        mat = new THREE.MeshPhysicalNodeMaterial()
        break
      case Lighting.STANDARD:
      default:
        mat = new THREE.MeshStandardNodeMaterial()
        break
    }

    // Calculate effective velocity for stretch
    const velocityCurveValue = curveSample.z
    const effectiveVelocityMultiplier = uniforms.velocityCurveEnabled
      .greaterThan(0.5)
      .select(velocityCurveValue, float(1))
    const effectiveSpeed = particleVel.length().mul(effectiveVelocityMultiplier)

    // Calculate stretch factor based on effective speed
    const stretchAmount = uniforms.stretchEnabled
      .greaterThan(0.5)
      .select(
        float(1).add(effectiveSpeed.mul(uniforms.stretchFactor)).min(uniforms.stretchMax),
        float(1)
      )

    const baseScale = particleSize.mul(sizeMultiplier)

    // Axis type: 0=+X, 1=+Y, 2=+Z, 3=-X, 4=-Y, 5=-Z
    const axisType = uniforms.orientAxisType
    const axisSign = axisType.lessThan(3).select(float(1), float(-1))
    const axisIndex = axisType.mod(3)

    // Apply stretch along the chosen LOCAL axis BEFORE rotation
    const stretchedLocal = uniforms.stretchEnabled
      .greaterThan(0.5)
      .select(
        axisIndex
          .lessThan(0.5)
          .select(
            vec3(positionLocal.x.mul(stretchAmount), positionLocal.y, positionLocal.z),
            axisIndex
              .lessThan(1.5)
              .select(
                vec3(positionLocal.x, positionLocal.y.mul(stretchAmount), positionLocal.z),
                vec3(positionLocal.x, positionLocal.y, positionLocal.z.mul(stretchAmount))
              )
          ),
        positionLocal
      )

    let rotatedPos: Node

    if (orientToDirection) {
      // Calculate velocity direction
      const velLen = particleVel.length().max(0.0001)
      const velDir = particleVel.div(velLen).mul(axisSign)

      // Get the local axis we want to align with velocity
      const localAxis = axisIndex
        .lessThan(0.5)
        .select(vec3(1, 0, 0), axisIndex.lessThan(1.5).select(vec3(0, 1, 0), vec3(0, 0, 1)))

      // Rodrigues' rotation formula
      const dotProduct = localAxis.dot(velDir).clamp(-1, 1)
      const crossProduct = localAxis.cross(velDir)
      const crossLen = crossProduct.length()

      const needsRotation = crossLen.greaterThan(0.0001)
      const rotAxis = needsRotation.select(crossProduct.div(crossLen), vec3(0, 1, 0))

      const cosAngleVal = dotProduct
      const sinAngleVal = crossLen
      const oneMinusCos = float(1).sub(cosAngleVal)

      const v = stretchedLocal
      const kDotV = rotAxis.dot(v)
      const kCrossV = rotAxis.cross(v)

      const rotatedByAxis = needsRotation.select(
        v
          .mul(cosAngleVal)
          .add(kCrossV.mul(sinAngleVal))
          .add(rotAxis.mul(kDotV.mul(oneMinusCos))),
        dotProduct.lessThan(-0.99).select(v.negate(), v)
      )

      rotatedPos = rotatedByAxis
    } else {
      // Use stored particle rotation (Euler angles)
      const rotX = particleRotation.x
      const rotY = particleRotation.y
      const rotZ = particleRotation.z

      // Rotation around X axis
      const cX = cos(rotX)
      const sX = sin(rotX)
      const afterX = vec3(
        stretchedLocal.x,
        stretchedLocal.y.mul(cX).sub(stretchedLocal.z.mul(sX)),
        stretchedLocal.y.mul(sX).add(stretchedLocal.z.mul(cX))
      )

      // Rotation around Y axis
      const cY = cos(rotY)
      const sY = sin(rotY)
      const afterY = vec3(
        afterX.x.mul(cY).add(afterX.z.mul(sY)),
        afterX.y,
        afterX.z.mul(cY).sub(afterX.x.mul(sY))
      )

      // Rotation around Z axis
      const cZ = cos(rotZ)
      const sZ = sin(rotZ)
      rotatedPos = vec3(
        afterY.x.mul(cZ).sub(afterY.y.mul(sZ)),
        afterY.x.mul(sZ).add(afterY.y.mul(cZ)),
        afterY.z
      )
    }

    // Apply base scale
    const scaledPos = rotatedPos.mul(baseScale)

    mat.positionNode = scaledPos.add(particlePos)

    // Apply custom colorNode if provided, otherwise use default
    const defaultColor = vec4(intensifiedColor, finalOpacity)
    mat.colorNode = colorNode
      ? typeof colorNode === 'function'
        ? colorNode(particleData, defaultColor)
        : colorNode
      : defaultColor

    mat.transparent = true
    mat.depthWrite = false
    mat.blending = blending
    mat.side = THREE.DoubleSide

    // Apply custom backdrop node if provided
    if (backdropNode) {
      mat.backdropNode =
        typeof backdropNode === 'function' ? backdropNode(particleData) : backdropNode
    }

    // Apply custom cast shadow node if provided
    if (castShadowNode) {
      mat.castShadowNode =
        typeof castShadowNode === 'function' ? castShadowNode(particleData) : castShadowNode
    }

    // Apply custom alpha test node if provided
    if (alphaTestNode) {
      mat.alphaTestNode =
        typeof alphaTestNode === 'function' ? alphaTestNode(particleData) : alphaTestNode
    }

    return mat
  } else {
    // Sprite mode (default)
    const mat = new THREE.SpriteNodeMaterial()

    // Apply custom colorNode if provided, otherwise use default
    const defaultColor = vec4(intensifiedColor, finalOpacity)
    mat.colorNode = colorNode
      ? typeof colorNode === 'function'
        ? colorNode(particleData, defaultColor)
        : colorNode
      : defaultColor

    mat.positionNode = storage.positions.toAttribute()
    mat.scaleNode = particleSize.mul(sizeMultiplier)
    mat.rotationNode = particleRotation.y
    mat.transparent = true
    mat.depthWrite = false
    mat.blending = blending

    // Apply custom backdrop node if provided
    if (backdropNode) {
      mat.backdropNode =
        typeof backdropNode === 'function' ? backdropNode(particleData) : backdropNode
    }

    // Apply custom cast shadow node if provided
    if (castShadowNode) {
      mat.castShadowNode =
        typeof castShadowNode === 'function' ? castShadowNode(particleData) : castShadowNode
    }

    // Apply custom alpha test node if provided
    if (alphaTestNode) {
      mat.alphaTestNode =
        typeof alphaTestNode === 'function' ? alphaTestNode(particleData) : alphaTestNode
    }

    return mat
  }
}
