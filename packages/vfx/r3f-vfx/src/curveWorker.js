/**
 * Web Worker for baking bezier curves to texture data
 * Offloads expensive curve calculations from the main thread
 */

const CURVE_RESOLUTION = 256

// Evaluate cubic bezier between two points with handles
const evaluateBezierSegment = (t, p0, p1, h0Out, h1In) => {
  const cp0 = p0
  const cp1 = [p0[0] + (h0Out?.[0] || 0), p0[1] + (h0Out?.[1] || 0)]
  const cp2 = [p1[0] + (h1In?.[0] || 0), p1[1] + (h1In?.[1] || 0)]
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
const sampleCurveAtX = (x, points) => {
  if (!points || points.length < 2) return x

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

  if (!p0?.pos || !p1?.pos) return x

  // Binary search for t that gives us x
  let tLow = 0
  let tHigh = 1
  let t = 0.5

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
  return Math.max(-0.5, Math.min(1.5, py))
}

// Bake a curve to a Float32Array
const bakeCurveToArray = (curveData) => {
  const data = new Float32Array(CURVE_RESOLUTION)

  if (
    !curveData?.points ||
    !Array.isArray(curveData.points) ||
    curveData.points.length < 2
  ) {
    // Default linear curve: 1→0 (fade out over lifetime)
    for (let i = 0; i < CURVE_RESOLUTION; i++) {
      data[i] = 1 - i / (CURVE_RESOLUTION - 1)
    }
    return data
  }

  const firstPoint = curveData.points[0]
  const lastPoint = curveData.points[curveData.points.length - 1]

  if (
    !firstPoint?.pos ||
    !lastPoint?.pos ||
    !Array.isArray(firstPoint.pos) ||
    !Array.isArray(lastPoint.pos)
  ) {
    // Fallback to linear: 1→0
    for (let i = 0; i < CURVE_RESOLUTION; i++) {
      data[i] = 1 - i / (CURVE_RESOLUTION - 1)
    }
    return data
  }

  for (let i = 0; i < CURVE_RESOLUTION; i++) {
    const x = i / (CURVE_RESOLUTION - 1)
    data[i] = sampleCurveAtX(x, curveData.points)
  }

  return data
}

// Bake all 4 curves and combine into RGBA texture data
const bakeCombinedCurves = (
  sizeCurve,
  opacityCurve,
  velocityCurve,
  rotationSpeedCurve
) => {
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

  return rgba
}

// Handle messages from main thread
self.onmessage = (e) => {
  const { id, sizeCurve, opacityCurve, velocityCurve, rotationSpeedCurve } =
    e.data

  const rgba = bakeCombinedCurves(
    sizeCurve,
    opacityCurve,
    velocityCurve,
    rotationSpeedCurve
  )

  // Transfer the buffer back (zero-copy)
  self.postMessage({ id, rgba }, [rgba.buffer])
}
