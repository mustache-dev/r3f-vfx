import { useRef, useEffect } from 'react';
import * as THREE from 'three/webgpu';
import {
  createDefaultCurveTexture,
  loadCurveTextureFromPath,
  CURVE_RESOLUTION,
  type CurveData,
} from 'core-vfx';
// @ts-expect-error - Vite worker import
import CurveWorker from './curveWorker.js?worker';

// Singleton worker for curve baking (shared across all VFXParticles instances)
let curveWorker: Worker | null = null;
let curveWorkerCallbacks = new Map<number, (rgba: Float32Array) => void>();
let curveWorkerIdCounter = 0;

const getCurveWorker = (): Worker => {
  if (!curveWorker) {
    curveWorker = new CurveWorker();
    curveWorker.onmessage = (e: MessageEvent<{ id: number; rgba: Float32Array }>) => {
      const { id, rgba } = e.data;
      const callback = curveWorkerCallbacks.get(id);
      if (callback) {
        callback(rgba);
        curveWorkerCallbacks.delete(id);
      }
    };
  }
  return curveWorker;
};

// Request curve baking from worker, returns a promise
const bakeCurvesAsync = (
  sizeCurve: CurveData | null,
  opacityCurve: CurveData | null,
  velocityCurve: CurveData | null,
  rotationSpeedCurve: CurveData | null
): Promise<Float32Array> => {
  return new Promise((resolve) => {
    const worker = getCurveWorker();
    const id = curveWorkerIdCounter++;
    curveWorkerCallbacks.set(id, resolve);
    worker.postMessage({
      id,
      sizeCurve,
      opacityCurve,
      velocityCurve,
      rotationSpeedCurve,
    });
  });
};

/**
 * Hook for async curve texture loading
 * Returns a STABLE texture reference that updates in place
 *
 * If curveTexturePath is provided, loads pre-baked texture (fast)
 * If curves are defined, bakes them in web worker
 * If no curves AND no path, returns default texture (no baking, instant)
 * 
 * The 4KB default texture is always created for shader compatibility,
 * but baking is skipped when not needed (main performance win).
 */
export const useCurveTextureAsync = (
  sizeCurve: CurveData | null,
  opacityCurve: CurveData | null,
  velocityCurve: CurveData | null,
  rotationSpeedCurve: CurveData | null,
  curveTexturePath: string | null = null
): THREE.DataTexture => {
  const textureRef = useRef<THREE.DataTexture | null>(null);
  const pendingRef = useRef<object | null>(null);

  // Create default texture once (4KB, instant, has correct linear 1→0 fallback)
  if (!textureRef.current) {
    textureRef.current = createDefaultCurveTexture();
  }

  useEffect(() => {
    const requestId = {};
    pendingRef.current = requestId;

    // Skip baking entirely if no curves are defined and no texture path
    // The default texture already has correct linear 1→0 fallback values
    const hasAnyCurve = sizeCurve || opacityCurve || velocityCurve || rotationSpeedCurve;
    
    if (curveTexturePath) {
      // Load pre-baked texture from .bin file (fast path, full float precision)
      loadCurveTextureFromPath(curveTexturePath, textureRef.current!)
        .catch((err) => {
          console.warn(
            `Failed to load curve texture: ${curveTexturePath}, falling back to baking`,
            err
          );
          // Fallback to baking if load fails
          return bakeCurvesAsync(sizeCurve, opacityCurve, velocityCurve, rotationSpeedCurve).then(
            (rgba) => {
              if (pendingRef.current === requestId && textureRef.current) {
                textureRef.current.image.data.set(rgba);
                textureRef.current.needsUpdate = true;
              }
            }
          );
        });
    } else if (hasAnyCurve) {
      // Only bake if at least one curve is defined
      bakeCurvesAsync(sizeCurve, opacityCurve, velocityCurve, rotationSpeedCurve).then((rgba) => {
        if (pendingRef.current === requestId && textureRef.current) {
          textureRef.current.image.data.set(rgba);
          textureRef.current.needsUpdate = true;
        }
      });
    }
    // else: no curves, no texture path → use default texture as-is (no baking needed)

    return () => {
      pendingRef.current = null;
    };
  }, [sizeCurve, opacityCurve, velocityCurve, rotationSpeedCurve, curveTexturePath]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      textureRef.current?.dispose();
      textureRef.current = null;
    };
  }, []);

  return textureRef.current!;
};

export default useCurveTextureAsync;
