import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import {
  createDefaultCurveTexture,
  createCombinedCurveTexture,
  loadCurveTextureFromPath,
  type CurveData,
} from 'core-vfx'

/**
 * Hook for curve texture loading/baking
 * Returns a STABLE texture reference that updates in place
 *
 * If curveTexturePath is provided, loads pre-baked texture from file
 * If curves are defined, bakes them synchronously on the main thread
 * If no curves AND no path, returns default texture (no baking needed)
 */
export const useCurveTextureAsync = (
  sizeCurve: CurveData | null,
  opacityCurve: CurveData | null,
  velocityCurve: CurveData | null,
  rotationSpeedCurve: CurveData | null,
  curveTexturePath: string | null = null
): THREE.DataTexture => {
  const textureRef = useRef<THREE.DataTexture | null>(null)

  // Create default texture once (4KB, instant, has correct linear 1→0 fallback)
  if (!textureRef.current) {
    textureRef.current = createDefaultCurveTexture()
  }

  // Synchronously bake curves when they change (no worker needed)
  const hasAnyCurve =
    sizeCurve || opacityCurve || velocityCurve || rotationSpeedCurve

  useMemo(() => {
    if (!curveTexturePath && hasAnyCurve && textureRef.current) {
      const bakedTexture = createCombinedCurveTexture(
        sizeCurve as CurveData,
        opacityCurve as CurveData,
        velocityCurve as CurveData,
        rotationSpeedCurve as CurveData
      )
      const srcData = bakedTexture.image.data as Float32Array | null
      const dstData = textureRef.current.image.data as Float32Array | null
      if (srcData && dstData) {
        dstData.set(srcData)
        textureRef.current.needsUpdate = true
      }
      bakedTexture.dispose()
    }
  }, [
    sizeCurve,
    opacityCurve,
    velocityCurve,
    rotationSpeedCurve,
    curveTexturePath,
    hasAnyCurve,
  ])

  // Load pre-baked texture from path (async fetch, but no worker)
  useEffect(() => {
    if (curveTexturePath && textureRef.current) {
      loadCurveTextureFromPath(curveTexturePath, textureRef.current).catch(
        (err) => {
          console.warn(
            `Failed to load curve texture: ${curveTexturePath}, falling back to baking`,
            err
          )
          // Fallback to synchronous baking if load fails
          if (hasAnyCurve && textureRef.current) {
            const bakedTexture = createCombinedCurveTexture(
              sizeCurve as CurveData,
              opacityCurve as CurveData,
              velocityCurve as CurveData,
              rotationSpeedCurve as CurveData
            )
            const srcData = bakedTexture.image.data as Float32Array | null
            const dstData = textureRef.current.image.data as Float32Array | null
            if (srcData && dstData) {
              dstData.set(srcData)
              textureRef.current.needsUpdate = true
            }
            bakedTexture.dispose()
          }
        }
      )
    }
  }, [
    curveTexturePath,
    sizeCurve,
    opacityCurve,
    velocityCurve,
    rotationSpeedCurve,
    hasAnyCurve,
  ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      textureRef.current?.dispose()
      textureRef.current = null
    }
  }, [])

  return textureRef.current!
}

export default useCurveTextureAsync
