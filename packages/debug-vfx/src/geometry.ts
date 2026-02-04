import * as THREE from 'three'

// Geometry types for the debug panel
export const GeometryType = Object.freeze({
  NONE: 'none', // Sprite mode (no geometry)
  BOX: 'box',
  SPHERE: 'sphere',
  CYLINDER: 'cylinder',
  CONE: 'cone',
  TORUS: 'torus',
  PLANE: 'plane',
  CIRCLE: 'circle',
  RING: 'ring',
  DODECAHEDRON: 'dodecahedron',
  ICOSAHEDRON: 'icosahedron',
  OCTAHEDRON: 'octahedron',
  TETRAHEDRON: 'tetrahedron',
  CAPSULE: 'capsule',
})

// Default arguments for each geometry type
export const geometryDefaults: Record<string, Record<string, number>> = {
  [GeometryType.BOX]: {
    width: 1,
    height: 1,
    depth: 1,
    widthSegments: 1,
    heightSegments: 1,
    depthSegments: 1,
  },
  [GeometryType.SPHERE]: { radius: 0.5, widthSegments: 16, heightSegments: 12 },
  [GeometryType.CYLINDER]: {
    radiusTop: 0.5,
    radiusBottom: 0.5,
    height: 1,
    radialSegments: 16,
    heightSegments: 1,
  },
  [GeometryType.CONE]: {
    radius: 0.5,
    height: 1,
    radialSegments: 16,
    heightSegments: 1,
  },
  [GeometryType.TORUS]: {
    radius: 0.5,
    tube: 0.2,
    radialSegments: 12,
    tubularSegments: 24,
  },
  [GeometryType.PLANE]: {
    width: 1,
    height: 1,
    widthSegments: 1,
    heightSegments: 1,
  },
  [GeometryType.CIRCLE]: { radius: 0.5, segments: 16 },
  [GeometryType.RING]: {
    innerRadius: 0.25,
    outerRadius: 0.5,
    thetaSegments: 16,
  },
  [GeometryType.DODECAHEDRON]: { radius: 0.5, detail: 0 },
  [GeometryType.ICOSAHEDRON]: { radius: 0.5, detail: 0 },
  [GeometryType.OCTAHEDRON]: { radius: 0.5, detail: 0 },
  [GeometryType.TETRAHEDRON]: { radius: 0.5, detail: 0 },
  [GeometryType.CAPSULE]: {
    radius: 0.25,
    length: 0.5,
    capSegments: 4,
    radialSegments: 8,
  },
}

// Create geometry from type and args
export const createGeometry = (
  type: string,
  args: Record<string, number> = {}
): THREE.BufferGeometry | null => {
  if (type === GeometryType.NONE || !type) return null

  const defaults = geometryDefaults[type] || {}
  const mergedArgs: Record<string, number> = { ...defaults, ...args }

  switch (type) {
    case GeometryType.BOX:
      return new THREE.BoxGeometry(
        mergedArgs.width,
        mergedArgs.height,
        mergedArgs.depth,
        mergedArgs.widthSegments,
        mergedArgs.heightSegments,
        mergedArgs.depthSegments
      )
    case GeometryType.SPHERE:
      return new THREE.SphereGeometry(
        mergedArgs.radius,
        mergedArgs.widthSegments,
        mergedArgs.heightSegments
      )
    case GeometryType.CYLINDER:
      return new THREE.CylinderGeometry(
        mergedArgs.radiusTop,
        mergedArgs.radiusBottom,
        mergedArgs.height,
        mergedArgs.radialSegments,
        mergedArgs.heightSegments
      )
    case GeometryType.CONE:
      return new THREE.ConeGeometry(
        mergedArgs.radius,
        mergedArgs.height,
        mergedArgs.radialSegments,
        mergedArgs.heightSegments
      )
    case GeometryType.TORUS:
      return new THREE.TorusGeometry(
        mergedArgs.radius,
        mergedArgs.tube,
        mergedArgs.radialSegments,
        mergedArgs.tubularSegments
      )
    case GeometryType.PLANE:
      return new THREE.PlaneGeometry(
        mergedArgs.width,
        mergedArgs.height,
        mergedArgs.widthSegments,
        mergedArgs.heightSegments
      )
    case GeometryType.CIRCLE:
      return new THREE.CircleGeometry(mergedArgs.radius, mergedArgs.segments)
    case GeometryType.RING:
      return new THREE.RingGeometry(
        mergedArgs.innerRadius,
        mergedArgs.outerRadius,
        mergedArgs.thetaSegments
      )
    case GeometryType.DODECAHEDRON:
      return new THREE.DodecahedronGeometry(
        mergedArgs.radius,
        mergedArgs.detail
      )
    case GeometryType.ICOSAHEDRON:
      return new THREE.IcosahedronGeometry(mergedArgs.radius, mergedArgs.detail)
    case GeometryType.OCTAHEDRON:
      return new THREE.OctahedronGeometry(mergedArgs.radius, mergedArgs.detail)
    case GeometryType.TETRAHEDRON:
      return new THREE.TetrahedronGeometry(mergedArgs.radius, mergedArgs.detail)
    case GeometryType.CAPSULE:
      return new THREE.CapsuleGeometry(
        mergedArgs.radius,
        mergedArgs.length,
        mergedArgs.capSegments,
        mergedArgs.radialSegments
      )
    default:
      return null
  }
}

// Detect geometry type and args from a Three.js geometry object
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function detectGeometryTypeAndArgs(geo: any) {
  if (!geo) return { geometryType: 'none', geometryArgs: null }

  const name = geo.constructor.name
  const params = geo.parameters || {}

  switch (name) {
    case 'BoxGeometry':
      return {
        geometryType: 'box',
        geometryArgs: {
          width: params.width ?? 1,
          height: params.height ?? 1,
          depth: params.depth ?? 1,
          widthSegments: params.widthSegments ?? 1,
          heightSegments: params.heightSegments ?? 1,
          depthSegments: params.depthSegments ?? 1,
        },
      }
    case 'SphereGeometry':
      return {
        geometryType: 'sphere',
        geometryArgs: {
          radius: params.radius ?? 0.5,
          widthSegments: params.widthSegments ?? 16,
          heightSegments: params.heightSegments ?? 12,
        },
      }
    case 'CylinderGeometry':
      return {
        geometryType: 'cylinder',
        geometryArgs: {
          radiusTop: params.radiusTop ?? 0.5,
          radiusBottom: params.radiusBottom ?? 0.5,
          height: params.height ?? 1,
          radialSegments: params.radialSegments ?? 16,
          heightSegments: params.heightSegments ?? 1,
        },
      }
    case 'ConeGeometry':
      return {
        geometryType: 'cone',
        geometryArgs: {
          radius: params.radius ?? 0.5,
          height: params.height ?? 1,
          radialSegments: params.radialSegments ?? 16,
          heightSegments: params.heightSegments ?? 1,
        },
      }
    case 'TorusGeometry':
      return {
        geometryType: 'torus',
        geometryArgs: {
          radius: params.radius ?? 0.5,
          tube: params.tube ?? 0.2,
          radialSegments: params.radialSegments ?? 12,
          tubularSegments: params.tubularSegments ?? 24,
        },
      }
    case 'PlaneGeometry':
      return {
        geometryType: 'plane',
        geometryArgs: {
          width: params.width ?? 1,
          height: params.height ?? 1,
          widthSegments: params.widthSegments ?? 1,
          heightSegments: params.heightSegments ?? 1,
        },
      }
    case 'CircleGeometry':
      return {
        geometryType: 'circle',
        geometryArgs: {
          radius: params.radius ?? 0.5,
          segments: params.segments ?? 16,
        },
      }
    case 'RingGeometry':
      return {
        geometryType: 'ring',
        geometryArgs: {
          innerRadius: params.innerRadius ?? 0.25,
          outerRadius: params.outerRadius ?? 0.5,
          thetaSegments: params.thetaSegments ?? 16,
        },
      }
    case 'DodecahedronGeometry':
      return {
        geometryType: 'dodecahedron',
        geometryArgs: {
          radius: params.radius ?? 0.5,
          detail: params.detail ?? 0,
        },
      }
    case 'IcosahedronGeometry':
      return {
        geometryType: 'icosahedron',
        geometryArgs: {
          radius: params.radius ?? 0.5,
          detail: params.detail ?? 0,
        },
      }
    case 'OctahedronGeometry':
      return {
        geometryType: 'octahedron',
        geometryArgs: {
          radius: params.radius ?? 0.5,
          detail: params.detail ?? 0,
        },
      }
    case 'TetrahedronGeometry':
      return {
        geometryType: 'tetrahedron',
        geometryArgs: {
          radius: params.radius ?? 0.5,
          detail: params.detail ?? 0,
        },
      }
    case 'CapsuleGeometry':
      return {
        geometryType: 'capsule',
        geometryArgs: {
          radius: params.radius ?? 0.25,
          length: params.length ?? 0.5,
          capSegments: params.capSegments ?? 4,
          radialSegments: params.radialSegments ?? 8,
        },
      }
    default:
      return { geometryType: 'none', geometryArgs: null }
  }
}
