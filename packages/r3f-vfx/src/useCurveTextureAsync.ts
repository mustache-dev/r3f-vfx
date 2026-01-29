import { useRef, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three/webgpu'
import {
  createDefaultCurveTexture,
  createCombinedCurveTexture,
  loadCurveTextureFromPath,
  CurveChannel,
  type CurveData,
} from 'core-vfx'

export type CurveTextureHookResult = {
  texture: THREE.DataTexture
  /** Per-channel enabled state, combining curve props and loaded .bin channels */
  sizeEnabled: boolean
  opacityEnabled: boolean
  velocityEnabled: boolean
  rotationSpeedEnabled: boolean
}

/**
 * Hook for curve texture loading/baking.
 *
 * If curveTexturePath is provided, loads pre-baked texture from file.
 * The .bin file contains a header with a bitmask of which channels are active.
 * Only those channels override the curve props; the rest use curve props or defaults.
 *
 * If curves are defined (no path), bakes them synchronously on the main thread.
 * If no curves AND no path, returns default texture (no baking needed).
 */
export const useCurveTextureAsync = (
  sizeCurve: CurveData | null,
  opacityCurve: CurveData | null,
  velocityCurve: CurveData | null,
  rotationSpeedCurve: CurveData | null,
  curveTexturePath: string | null = null
): CurveTextureHookResult => {
  const hasAnyCurve =
    sizeCurve || opacityCurve || velocityCurve || rotationSpeedCurve

  // Synchronous path: bake curves during render so texture is ready immediately
  const texture = useMemo(() => {
    if (!curveTexturePath && hasAnyCurve) {
      return createCombinedCurveTexture(
        sizeCurve as CurveData,
        opacityCurve as CurveData,
        velocityCurve as CurveData,
        rotationSpeedCurve as CurveData
      )
    }
    return createDefaultCurveTexture()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sizeCurve,
    opacityCurve,
    velocityCurve,
    rotationSpeedCurve,
    curveTexturePath,
    hasAnyCurve,
  ])

  // Async path: load pre-baked texture from file, then replace via state
  const [loadedTexture, setLoadedTexture] = useState<THREE.DataTexture | null>(
    null
  )
  const [loadedChannels, setLoadedChannels] = useState<number>(0)

  useEffect(() => {
    if (!curveTexturePath) {
      setLoadedTexture(null)
      setLoadedChannels(0)
      return
    }

    let cancelled = false

    loadCurveTextureFromPath(curveTexturePath)
      .then((result) => {
        if (!cancelled) {
          setLoadedTexture(result.texture)
          setLoadedChannels(result.activeChannels)
        } else {
          result.texture.dispose()
        }
      })
      .catch((err) => {
        console.warn(
          `Failed to load curve texture: ${curveTexturePath}, falling back to baking`,
          err
        )
        if (!cancelled && hasAnyCurve) {
          setLoadedTexture(
            createCombinedCurveTexture(
              sizeCurve as CurveData,
              opacityCurve as CurveData,
              velocityCurve as CurveData,
              rotationSpeedCurve as CurveData
            )
          )
          // Fallback: enable only channels that have curve props
          let mask = 0
          if (sizeCurve) mask |= CurveChannel.SIZE
          if (opacityCurve) mask |= CurveChannel.OPACITY
          if (velocityCurve) mask |= CurveChannel.VELOCITY
          if (rotationSpeedCurve) mask |= CurveChannel.ROTATION_SPEED
          setLoadedChannels(mask)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    curveTexturePath,
    sizeCurve,
    opacityCurve,
    velocityCurve,
    rotationSpeedCurve,
    hasAnyCurve,
  ])

  // Use loaded texture if available, otherwise use synchronously baked one
  const activeTexture = loadedTexture ?? texture

  // Determine per-channel enabled state:
  // - If curveTexturePath loaded: use loaded channel bitmask
  // - Otherwise: use curve prop presence
  const sizeEnabled = loadedTexture
    ? !!(loadedChannels & CurveChannel.SIZE)
    : !!sizeCurve
  const opacityEnabled = loadedTexture
    ? !!(loadedChannels & CurveChannel.OPACITY)
    : !!opacityCurve
  const velocityEnabled = loadedTexture
    ? !!(loadedChannels & CurveChannel.VELOCITY)
    : !!velocityCurve
  const rotationSpeedEnabled = loadedTexture
    ? !!(loadedChannels & CurveChannel.ROTATION_SPEED)
    : !!rotationSpeedCurve

  // Dispose old textures when they change
  const prevTextureRef = useRef<THREE.DataTexture | null>(null)
  useEffect(() => {
    const prev = prevTextureRef.current
    if (prev && prev !== activeTexture) {
      prev.dispose()
    }
    prevTextureRef.current = activeTexture
  }, [activeTexture])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      prevTextureRef.current?.dispose()
      prevTextureRef.current = null
    }
  }, [])

  return {
    texture: activeTexture,
    sizeEnabled,
    opacityEnabled,
    velocityEnabled,
    rotationSpeedEnabled,
  }
}

export default useCurveTextureAsync
