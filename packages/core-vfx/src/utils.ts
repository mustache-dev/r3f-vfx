// Check if the renderer is using the WebGPU backend
export const isWebGPUBackend = (renderer: unknown): boolean =>
  (renderer as any)?.backend?.isWebGPUBackend === true

// Convert hex color string to RGB array [0-1]
export const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ]
    : [1, 1, 1]
}

// Normalize a prop to [min, max] array - if single value, use same for both
export const toRange = (
  value: number | [number, number] | null | undefined,
  defaultVal: [number, number] = [0, 0]
): [number, number] => {
  if (value === undefined || value === null) return defaultVal
  if (Array.isArray(value))
    return value.length === 2 ? value : [value[0], value[0]]
  return [value, value]
}

// Convert easing string to type number
export const easingToType = (easing: string | number | undefined): number => {
  if (typeof easing === 'number') return easing
  switch (easing) {
    case 'easeIn':
      return 1
    case 'easeOut':
      return 2
    case 'easeInOut':
      return 3
    default:
      return 0 // linear
  }
}

// Convert axis string to number: 0=+X, 1=+Y, 2=+Z, 3=-X, 4=-Y, 5=-Z
export const axisToNumber = (axis: string): number => {
  switch (axis) {
    case 'x':
    case '+x':
    case 'X':
    case '+X':
      return 0
    case 'y':
    case '+y':
    case 'Y':
    case '+Y':
      return 1
    case 'z':
    case '+z':
    case 'Z':
    case '+Z':
      return 2
    case '-x':
    case '-X':
      return 3
    case '-y':
    case '-Y':
      return 4
    case '-z':
    case '-Z':
      return 5
    default:
      return 2 // default to +Z
  }
}

// Normalize rotation prop to 3D format [[minX, maxX], [minY, maxY], [minZ, maxZ]]
// Supports:
// - Single number: rotation={0.5} → same rotation for all axes
// - [min, max]: rotation={[0, Math.PI]} → random in range for all axes
// - [[minX, maxX], [minY, maxY], [minZ, maxZ]]: full 3D control
export const toRotation3D = (
  value:
    | number
    | [number, number]
    | [[number, number], [number, number], [number, number]]
    | null
    | undefined
): [[number, number], [number, number], [number, number]] => {
  if (value === undefined || value === null)
    return [
      [0, 0],
      [0, 0],
      [0, 0],
    ]
  if (typeof value === 'number')
    return [
      [value, value],
      [value, value],
      [value, value],
    ]
  if (Array.isArray(value)) {
    // Check if nested array [[x], [y], [z]]
    if (Array.isArray(value[0])) {
      const nested = value as [
        [number, number],
        [number, number],
        [number, number],
      ]
      return [
        toRange(nested[0], [0, 0]),
        toRange(nested[1], [0, 0]),
        toRange(nested[2], [0, 0]),
      ]
    }
    // Simple [min, max] - apply to all axes
    const range = toRange(value as [number, number], [0, 0])
    return [range, range, range]
  }
  return [
    [0, 0],
    [0, 0],
    [0, 0],
  ]
}

// Convert lifetime in seconds to fade rate per second (framerate independent)
export const lifetimeToFadeRate = (seconds: number): number => 1 / seconds

// Check if rotation/rotationSpeed is non-default (any axis has non-zero range)
export const isNonDefaultRotation = (
  r:
    | number
    | [number, number]
    | [[number, number], [number, number], [number, number]]
    | null
    | undefined
): boolean => {
  if (r === null || r === undefined) return false
  if (typeof r === 'number') return r !== 0
  if (Array.isArray(r) && r.length === 2 && typeof r[0] === 'number') {
    return (r as [number, number])[0] !== 0 || (r as [number, number])[1] !== 0
  }
  // 3D format [[minX, maxX], [minY, maxY], [minZ, maxZ]]
  if (Array.isArray(r)) {
    return (r as [number, number][]).some(
      (axis) => Array.isArray(axis) && (axis[0] !== 0 || axis[1] !== 0)
    )
  }
  return false
}

// Normalize BaseParticleProps into fully-resolved NormalizedParticleProps
import type { BaseParticleProps, NormalizedParticleProps } from './types'
import { Appearance, Blending, EmitterShape, Lighting } from './constants'

export const normalizeProps = (
  props: BaseParticleProps
): NormalizedParticleProps => {
  const maxParticles = props.maxParticles ?? 10000
  const size = props.size ?? [0.1, 0.3]
  const speed = props.speed ?? [0.1, 0.1]
  const fadeSize = props.fadeSize ?? [1, 0]
  const fadeOpacity = props.fadeOpacity ?? [1, 0]
  const lifetime = props.lifetime ?? [1, 2]
  const gravity = props.gravity ?? [0, 0, 0]
  const direction = props.direction ?? [
    [-1, 1],
    [0, 1],
    [-1, 1],
  ]
  const startPosition = props.startPosition ?? [
    [0, 0],
    [0, 0],
    [0, 0],
  ]
  const rotation = props.rotation ?? [0, 0]
  const rotationSpeed = props.rotationSpeed ?? [0, 0]
  const friction = props.friction ?? { intensity: 0, easing: 'linear' }
  const colorStart = props.colorStart ?? ['#ffffff']
  const colorEnd = props.colorEnd ?? null
  const emitterRadius = props.emitterRadius ?? [0, 1]
  const emitterHeight = props.emitterHeight ?? [0, 1]
  const intensity = props.intensity ?? 1
  const position = props.position ?? [0, 0, 0]
  const autoStart = props.autoStart ?? true
  const delay = props.delay ?? 0
  const emitCount = props.emitCount ?? 1
  const emitterShape = props.emitterShape ?? EmitterShape.BOX
  const emitterAngle = props.emitterAngle ?? Math.PI / 4
  const emitterSurfaceOnly = props.emitterSurfaceOnly ?? false
  const emitterDirection = props.emitterDirection ?? [0, 1, 0]
  const turbulence = props.turbulence ?? null
  const attractors = props.attractors ?? null
  const attractToCenter = props.attractToCenter ?? false
  const startPositionAsDirection = props.startPositionAsDirection ?? false
  const softParticles = props.softParticles ?? false
  const softDistance = props.softDistance ?? 0.5
  const collision = props.collision ?? null
  const appearance = props.appearance ?? Appearance.GRADIENT
  const alphaMap = props.alphaMap ?? null
  const flipbook = props.flipbook ?? null
  const geometry = props.geometry ?? null
  const orientToDirection = props.orientToDirection ?? false
  const orientAxis = props.orientAxis ?? 'z'
  const stretchBySpeed = props.stretchBySpeed ?? null
  const lighting = props.lighting ?? Lighting.STANDARD
  const shadow = props.shadow ?? false
  const blending = props.blending ?? Blending.NORMAL

  // Normalize ranges
  const sizeRange = toRange(size, [0.1, 0.3])
  const speedRange = toRange(speed, [0.1, 0.1])
  const fadeSizeRange = toRange(fadeSize, [1, 0])
  const fadeOpacityRange = toRange(fadeOpacity, [1, 0])
  const lifetimeRange = toRange(lifetime, [1, 2])
  const direction3D = toRotation3D(direction)
  const startPosition3D = toRotation3D(startPosition)
  const rotation3D = toRotation3D(rotation)
  const rotationSpeed3D = toRotation3D(rotationSpeed)
  const emitterRadiusRange = toRange(emitterRadius, [0, 1])
  const emitterHeightRange = toRange(emitterHeight, [0, 1])

  // Parse friction
  const frictionIntensityRange: [number, number] =
    typeof friction === 'object' && friction !== null && 'intensity' in friction
      ? toRange(friction.intensity, [0, 0])
      : [0, 0]
  const frictionEasingType =
    typeof friction === 'object' && friction !== null && 'easing' in friction
      ? easingToType(friction.easing ?? 'linear')
      : 0

  // Convert color arrays to RGB (support up to 8 colors each)
  const startColors: [number, number, number][] = colorStart
    .slice(0, 8)
    .map(hexToRgb)
  while (startColors.length < 8)
    startColors.push(startColors[startColors.length - 1] || [1, 1, 1])

  const effectiveColorEnd = colorEnd ?? colorStart
  const endColors: [number, number, number][] = effectiveColorEnd
    .slice(0, 8)
    .map(hexToRgb)
  while (endColors.length < 8)
    endColors.push(endColors[endColors.length - 1] || [1, 1, 1])

  return {
    maxParticles,
    sizeRange,
    speedRange,
    fadeSizeRange,
    fadeOpacityRange,
    lifetimeRange,
    gravity,
    direction3D,
    startPosition3D,
    rotation3D,
    rotationSpeed3D,
    frictionIntensityRange,
    frictionEasingType,
    startColors,
    endColors,
    colorStartCount: colorStart.length,
    colorEndCount: effectiveColorEnd.length,
    emitterRadiusRange,
    emitterHeightRange,
    intensity,
    position,
    autoStart,
    delay,
    emitCount,
    emitterShape,
    emitterAngle,
    emitterSurfaceOnly,
    emitterDirection,
    turbulence,
    attractors,
    attractToCenter,
    startPositionAsDirection,
    softParticles,
    softDistance,
    collision,
    appearance,
    alphaMap,
    flipbook,
    rotation,
    rotationSpeed,
    geometry,
    orientToDirection,
    orientAxis,
    stretchBySpeed,
    lighting,
    shadow,
    blending,
    depthTest: true,
    renderOrder: 0,
    colorStart,
    colorEnd,
    // Keep raw values
    size,
    speed,
    fadeSize,
    fadeOpacity,
    lifetime,
    direction,
    startPosition,
    friction,
    emitterRadius,
    emitterHeight,
  }
}
