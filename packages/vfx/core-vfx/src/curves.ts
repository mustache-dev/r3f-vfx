import * as THREE from 'three/webgpu'
import { CURVE_RESOLUTION } from './constants'
import type { CurveData, CurvePoint } from './types'

// Evaluate cubic bezier between two points with handles
export const evaluateBezierSegment = (
  t: number,
  p0: [number, number],
  p1: [number, number],
  h0Out?: [number, number],
  h1In?: [number, number]
): [number, number] => {
  // p0 = start point [x, y], p1 = end point [x, y]
  // h0Out = handle out from p0 (offset), h1In = handle in to p1 (offset)
  const cp0 = p0
  const cp1: [number, number] = [
    p0[0] + (h0Out?.[0] || 0),
    p0[1] + (h0Out?.[1] || 0),
  ]
  const cp2: [number, number] = [
    p1[0] + (h1In?.[0] || 0),
    p1[1] + (h1In?.[1] || 0),
  ]
  const cp3 = p1

  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  const t2 = t * t
  const t3 = t2 * t

  return [
    mt3 * cp0[0] + 3 * mt2 * t * cp1[0] + 3 * mt * t2 * cp2[0] + t3 * cp3[0],
    mt3 * cp0[1] + 3 * mt2 * t * cp1[1] + 3 * mt * t2 * cp2[1] + t3 * cp3[1],
  ]
}

// Find Y value for a given X on the curve using binary search
export const sampleCurveAtX = (x: number, points: CurvePoint[]): number => {
  if (!points || points.length < 2) return x // Linear fallback

  // Validate points have required data
  if (!points[0]?.pos || !points[points.length - 1]?.pos) return x

  // Find the segment containing x
  let segmentIdx = 0
  for (let i = 0; i < points.length - 1; i++) {
    if (
      points[i]?.pos &&
      points[i + 1]?.pos &&
      x >= points[i].pos[0] &&
      x <= points[i + 1].pos[0]
    ) {
      segmentIdx = i
      break
    }
  }

  const p0 = points[segmentIdx]
  const p1 = points[segmentIdx + 1]

  // Validate segment points
  if (!p0?.pos || !p1?.pos) return x

  // Binary search for t that gives us x
  let tLow = 0,
    tHigh = 1,
    t = 0.5
  for (let iter = 0; iter < 20; iter++) {
    const [px] = evaluateBezierSegment(
      t,
      p0.pos,
      p1.pos,
      p0.handleOut,
      p1.handleIn
    )
    if (Math.abs(px - x) < 0.0001) break
    if (px < x) {
      tLow = t
    } else {
      tHigh = t
    }
    t = (tLow + tHigh) / 2
  }

  const [, py] = evaluateBezierSegment(
    t,
    p0.pos,
    p1.pos,
    p0.handleOut,
    p1.handleIn
  )
  // Allow values outside 0-1 for overshoot effects (elastic, bounce)
  // Clamp to reasonable range to prevent extreme values
  return Math.max(-0.5, Math.min(1.5, py))
}

// Bake a curve to a Float32Array for use in DataTexture
export const bakeCurveToArray = (
  curveData: CurveData,
  resolution = CURVE_RESOLUTION
): Float32Array => {
  const data = new Float32Array(resolution)

  // Validate curve data structure
  if (
    !curveData?.points ||
    !Array.isArray(curveData.points) ||
    curveData.points.length < 2
  ) {
    // Default linear curve: 1→0 (fade out over lifetime, matching default behavior)
    for (let i = 0; i < resolution; i++) {
      data[i] = 1 - i / (resolution - 1)
    }
    return data
  }

  // Validate first and last points have pos arrays
  const firstPoint = curveData.points[0]
  const lastPoint = curveData.points[curveData.points.length - 1]
  if (
    !firstPoint?.pos ||
    !lastPoint?.pos ||
    !Array.isArray(firstPoint.pos) ||
    !Array.isArray(lastPoint.pos)
  ) {
    // Fallback to linear: 1→0 (fade out)
    for (let i = 0; i < resolution; i++) {
      data[i] = 1 - i / (resolution - 1)
    }
    return data
  }

  for (let i = 0; i < resolution; i++) {
    const x = i / (resolution - 1) // 0 to 1
    data[i] = sampleCurveAtX(x, curveData.points)
  }

  return data
}

// Create a combined DataTexture from multiple curve data
// R = size curve, G = opacity curve, B = velocity curve, A = rotation speed curve
export const createCombinedCurveTexture = (
  sizeCurve: CurveData,
  opacityCurve: CurveData,
  velocityCurve: CurveData,
  rotationSpeedCurve: CurveData
): THREE.DataTexture => {
  const sizeData = bakeCurveToArray(sizeCurve)
  const opacityData = bakeCurveToArray(opacityCurve)
  const velocityData = bakeCurveToArray(velocityCurve)
  const rotationSpeedData = bakeCurveToArray(rotationSpeedCurve)

  const rgba = new Float32Array(CURVE_RESOLUTION * 4)
  for (let i = 0; i < CURVE_RESOLUTION; i++) {
    rgba[i * 4] = sizeData[i] // R - size easing
    rgba[i * 4 + 1] = opacityData[i] // G - opacity easing
    rgba[i * 4 + 2] = velocityData[i] // B - velocity easing
    rgba[i * 4 + 3] = rotationSpeedData[i] // A - rotation speed easing
  }

  const tex = new THREE.DataTexture(
    rgba,
    CURVE_RESOLUTION,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

// Default linear curve: starts at 1, ends at 0 (fade out behavior)
// Curve Y-value is the DIRECT multiplier: y=1 means full, y=0 means none
export const DEFAULT_LINEAR_CURVE = {
  points: [
    {
      pos: [0, 1] as [number, number],
      handleOut: [0.33, 0] as [number, number],
    },
    {
      pos: [1, 0] as [number, number],
      handleIn: [-0.33, 0] as [number, number],
    },
  ],
}

// Create a default linear texture (1→0 fade) for immediate use
export const createDefaultCurveTexture = (): THREE.DataTexture => {
  const rgba = new Float32Array(CURVE_RESOLUTION * 4)
  for (let i = 0; i < CURVE_RESOLUTION; i++) {
    const value = 1 - i / (CURVE_RESOLUTION - 1)
    rgba[i * 4] = value // R - size
    rgba[i * 4 + 1] = value // G - opacity
    rgba[i * 4 + 2] = value // B - velocity
    rgba[i * 4 + 3] = value // A - rotation speed
  }
  const tex = new THREE.DataTexture(
    rgba,
    CURVE_RESOLUTION,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

// Load a pre-baked curve texture from a binary file
export const loadCurveTextureFromPath = async (
  path: string,
  existingTexture?: THREE.DataTexture
): Promise<THREE.DataTexture> => {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load curve texture: HTTP ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const rgba = new Float32Array(buffer)

  if (rgba.length !== CURVE_RESOLUTION * 4) {
    throw new Error(
      `Invalid curve texture size: expected ${CURVE_RESOLUTION * 4}, got ${rgba.length}`
    )
  }

  // If existing texture provided, update it in place (avoids shader recompilation)
  if (existingTexture) {
    existingTexture.image.data.set(rgba)
    existingTexture.needsUpdate = true
    return existingTexture
  }

  // Create new texture
  const tex = new THREE.DataTexture(
    rgba,
    CURVE_RESOLUTION,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}
