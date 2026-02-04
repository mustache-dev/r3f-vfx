import { GeometryType, geometryDefaults } from './geometry'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Values = Record<string, any>

// Helper to format value for JSX output
const formatJSXValue = (key: string, value: unknown): string | null => {
  if (value === undefined || value === null) return null

  // Booleans
  if (typeof value === 'boolean') {
    return value ? `${key}={true}` : `${key}={false}`
  }

  // Numbers
  if (typeof value === 'number') {
    return `${key}={${value}}`
  }

  // Strings
  if (typeof value === 'string') {
    // Check if it's a color
    if (value.startsWith('#') || value.startsWith('rgb')) {
      return `${key}="${value}"`
    }
    return `${key}="${value}"`
  }

  // Arrays
  if (Array.isArray(value)) {
    // Check if it's an array of colors (strings starting with #)
    if (
      value.length > 0 &&
      typeof value[0] === 'string' &&
      value[0].startsWith('#')
    ) {
      return `${key}={[${value.map((v: string) => `"${v}"`).join(', ')}]}`
    }
    // Check if it's a 2D array (like direction [[min, max], [min, max], [min, max]])
    if (value.length > 0 && Array.isArray(value[0])) {
      return `${key}={[${value.map((v: number[]) => `[${v.join(', ')}]`).join(', ')}]}`
    }
    // Simple array of numbers
    return `${key}={[${value.join(', ')}]}`
  }

  // Objects
  if (typeof value === 'object') {
    const formatValue = (v: unknown, indent: number): string => {
      if (v === undefined || v === null) return 'null'
      if (typeof v === 'string') return `"${v}"`
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      if (Array.isArray(v)) {
        // Check if array of objects
        if (v.length > 0 && typeof v[0] === 'object' && !Array.isArray(v[0])) {
          const items = v.map((item: unknown) => formatValue(item, indent + 2))
          return `[\n${items.map((i: string) => ' '.repeat(indent + 2) + i).join(',\n')}\n${' '.repeat(indent)}]`
        }
        // Simple array
        return `[${v.map((item: unknown) => formatValue(item, indent)).join(', ')}]`
      }
      if (typeof v === 'object') {
        return formatObject(v as Record<string, unknown>, indent + 2)
      }
      return String(v)
    }

    const formatObject = (obj: Record<string, unknown>, indent = 2): string => {
      const entries = Object.entries(obj).filter(
        ([, v]) => v !== undefined && v !== null
      )
      if (entries.length === 0) return '{}'

      const lines = entries.map(([k, v]) => {
        return `${' '.repeat(indent)}${k}: ${formatValue(v, indent)}`
      })
      return `{\n${lines.join(',\n')}\n${' '.repeat(indent - 2)}}`
    }
    return `${key}={${formatObject(value as Record<string, unknown>, 4)}}`
  }

  return null
}

// Map geometry type to Three.js constructor call
const geometryTypeToJSX = (
  type: string,
  args: Record<string, number> | null
): string | null => {
  if (!type || type === GeometryType.NONE) return null

  const defaults = geometryDefaults[type] || {}
  const mergedArgs: Record<string, number> = { ...defaults, ...args }

  const formatArgs = (argNames: string[]) => {
    return argNames.map((name) => mergedArgs[name]).join(', ')
  }

  switch (type) {
    case GeometryType.BOX:
      return `new BoxGeometry(${formatArgs(['width', 'height', 'depth', 'widthSegments', 'heightSegments', 'depthSegments'])})`
    case GeometryType.SPHERE:
      return `new SphereGeometry(${formatArgs(['radius', 'widthSegments', 'heightSegments'])})`
    case GeometryType.CYLINDER:
      return `new CylinderGeometry(${formatArgs(['radiusTop', 'radiusBottom', 'height', 'radialSegments', 'heightSegments'])})`
    case GeometryType.CONE:
      return `new ConeGeometry(${formatArgs(['radius', 'height', 'radialSegments', 'heightSegments'])})`
    case GeometryType.TORUS:
      return `new TorusGeometry(${formatArgs(['radius', 'tube', 'radialSegments', 'tubularSegments'])})`
    case GeometryType.PLANE:
      return `new PlaneGeometry(${formatArgs(['width', 'height', 'widthSegments', 'heightSegments'])})`
    case GeometryType.CIRCLE:
      return `new CircleGeometry(${formatArgs(['radius', 'segments'])})`
    case GeometryType.RING:
      return `new RingGeometry(${formatArgs(['innerRadius', 'outerRadius', 'thetaSegments'])})`
    case GeometryType.DODECAHEDRON:
      return `new DodecahedronGeometry(${formatArgs(['radius', 'detail'])})`
    case GeometryType.ICOSAHEDRON:
      return `new IcosahedronGeometry(${formatArgs(['radius', 'detail'])})`
    case GeometryType.OCTAHEDRON:
      return `new OctahedronGeometry(${formatArgs(['radius', 'detail'])})`
    case GeometryType.TETRAHEDRON:
      return `new TetrahedronGeometry(${formatArgs(['radius', 'detail'])})`
    case GeometryType.CAPSULE:
      return `new CapsuleGeometry(${formatArgs(['radius', 'length', 'capSegments', 'radialSegments'])})`
    default:
      return null
  }
}

// Helper to check if array equals default
const arraysEqual = (a: unknown, b: unknown[]): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  return a.every((v, i) => {
    if (Array.isArray(v) && Array.isArray(b[i]))
      return arraysEqual(v, b[i] as unknown[])
    return v === b[i]
  })
}

// Helper to check if friction is at default (no effect)
const isDefaultFriction = (f: Values | null): boolean => {
  if (!f) return true
  const intensity = f.intensity
  if (Array.isArray(intensity)) {
    return intensity[0] === 0 && intensity[1] === 0
  }
  return intensity === 0 || intensity === undefined
}

// Helper to check if turbulence is at default (no effect)
const isDefaultTurbulence = (t: Values | null): boolean => {
  if (!t) return true
  return t.intensity === 0 || t.intensity === undefined
}

// Shared prop order for code generation
const propOrder = [
  'name',
  'curveTexturePath',
  'maxParticles',
  'position',
  'autoStart',
  'emitCount',
  'delay',
  'intensity',
  'size',
  'fadeSize',
  'fadeSizeCurve',
  'colorStart',
  'colorEnd',
  'fadeOpacity',
  'fadeOpacityCurve',
  'gravity',
  'speed',
  'lifetime',
  'friction',
  'velocityCurve',
  'direction',
  'startPosition',
  'startPositionAsDirection',
  'rotation',
  'rotationSpeed',
  'rotationSpeedCurve',
  'orientToDirection',
  'orientAxis',
  'stretchBySpeed',
  'appearance',
  'blending',
  'lighting',
  'shadow',
  'emitterShape',
  'emitterRadius',
  'emitterAngle',
  'emitterHeight',
  'emitterDirection',
  'emitterSurfaceOnly',
  'turbulence',
  'collision',
  'softParticles',
  'softDistance',
  'attractToCenter',
]

// Returns true if the key/value should be skipped (is at default)
const shouldSkipDefault = (
  key: string,
  value: unknown,
  values: Values
): boolean => {
  if (value === undefined || value === null) return true

  if (key === 'name' && !value) return true
  if (key === 'curveTexturePath' && !value) return true
  if (key === 'maxParticles' && value === 10000) return true
  if (key === 'position' && arraysEqual(value, [0, 0, 0])) return true
  if (key === 'autoStart' && value === true) return true
  if (key === 'emitCount' && value === 1) return true
  if (key === 'delay' && value === 0) return true
  if (key === 'intensity' && value === 1) return true

  // Size/speed/lifetime defaults
  if (key === 'size' && arraysEqual(value, [0.1, 0.3])) return true
  if (key === 'speed' && arraysEqual(value, [0.1, 0.1])) return true
  if (key === 'lifetime' && arraysEqual(value, [1, 2])) return true

  // Fade defaults (both 1→0)
  if (key === 'fadeSize' && arraysEqual(value, [1, 0])) return true
  if (key === 'fadeOpacity' && arraysEqual(value, [1, 0])) return true

  // Color defaults
  if (key === 'colorStart' && arraysEqual(value, ['#ffffff'])) return true

  // Physics defaults
  if (key === 'gravity' && arraysEqual(value, [0, 0, 0])) return true
  if (key === 'friction' && isDefaultFriction(value as Values)) return true
  // Skip friction if velocityCurve is active (they're mutually exclusive)
  if (key === 'friction' && values.velocityCurve) return true

  // Direction defaults
  if (
    key === 'direction' &&
    arraysEqual(value, [
      [-1, 1],
      [0, 1],
      [-1, 1],
    ])
  )
    return true
  // Skip direction if startPositionAsDirection is enabled (direction is ignored)
  if (key === 'direction' && values.startPositionAsDirection) return true

  // Start position default (no offset)
  if (
    key === 'startPosition' &&
    arraysEqual(value, [
      [0, 0],
      [0, 0],
      [0, 0],
    ])
  )
    return true
  if (key === 'startPositionAsDirection' && value === false) return true

  // Rotation defaults (no rotation)
  if (key === 'rotation' && arraysEqual(value, [0, 0])) return true
  if (key === 'rotationSpeed' && arraysEqual(value, [0, 0])) return true

  // Appearance/blending/lighting defaults
  if (key === 'appearance' && value === 0) return true // GRADIENT
  if (key === 'blending' && value === 1) return true // NORMAL
  if (key === 'lighting' && value === 1) return true // STANDARD

  if (key === 'shadow' && value === false) return true
  if (key === 'orientToDirection' && value === false) return true
  // Skip orientAxis if default "z" OR if neither orientToDirection nor stretchBySpeed is active
  if (key === 'orientAxis') {
    const axisNeeded = values.orientToDirection || values.stretchBySpeed
    if (!axisNeeded || value === 'z' || value === '+z') return true
  }
  if (key === 'stretchBySpeed' && !value) return true

  // Emitter shape defaults
  if (key === 'emitterShape' && value === 0) return true // BOX
  if (key === 'emitterRadius' && arraysEqual(value, [0, 1])) return true
  if (
    key === 'emitterAngle' &&
    Math.abs((value as number) - Math.PI / 4) < 0.001
  )
    return true
  if (key === 'emitterHeight' && arraysEqual(value, [0, 1])) return true
  if (key === 'emitterDirection' && arraysEqual(value, [0, 1, 0])) return true
  if (key === 'emitterSurfaceOnly' && value === false) return true

  // Effects defaults (disabled)
  if (key === 'turbulence' && isDefaultTurbulence(value as Values)) return true
  if (key === 'collision' && !value) return true
  if (key === 'softParticles' && value === false) return true
  if (key === 'softDistance' && !values.softParticles) return true
  if (key === 'attractToCenter' && value === false) return true

  return false
}

// Generate full JSX string from values
export const generateVFXParticlesJSX = (values: Values): string => {
  const props: string[] = []

  // Handle geometry specially
  if (values.geometryType && values.geometryType !== GeometryType.NONE) {
    const geoJsx = geometryTypeToJSX(values.geometryType, values.geometryArgs)
    if (geoJsx) {
      props.push(`geometry={${geoJsx}}`)
    }
  }

  for (const key of propOrder) {
    const value = values[key]
    if (shouldSkipDefault(key, value, values)) continue

    const formatted = formatJSXValue(key, value)
    if (formatted) props.push(formatted)
  }

  if (props.length === 0) {
    return '<VFXParticles />'
  }

  return `<VFXParticles\n  ${props.join('\n  ')}\n/>`
}

// Format a value as a JS object property: "key: value,"
const formatObjectProp = (key: string, value: unknown): string | null => {
  if (value === undefined || value === null) return null

  // Booleans
  if (typeof value === 'boolean') {
    return `  ${key}: ${value},`
  }

  // Numbers
  if (typeof value === 'number') {
    return `  ${key}: ${value},`
  }

  // Strings
  if (typeof value === 'string') {
    return `  ${key}: "${value}",`
  }

  // Arrays
  if (Array.isArray(value)) {
    if (
      value.length > 0 &&
      typeof value[0] === 'string' &&
      value[0].startsWith('#')
    ) {
      return `  ${key}: [${value.map((v: string) => `"${v}"`).join(', ')}],`
    }
    if (value.length > 0 && Array.isArray(value[0])) {
      return `  ${key}: [${value.map((v: number[]) => `[${v.join(', ')}]`).join(', ')}],`
    }
    return `  ${key}: [${value.join(', ')}],`
  }

  // Objects
  if (typeof value === 'object') {
    const formatValue = (v: unknown, indent: number): string => {
      if (v === undefined || v === null) return 'null'
      if (typeof v === 'string') return `"${v}"`
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      if (Array.isArray(v)) {
        if (v.length > 0 && typeof v[0] === 'object' && !Array.isArray(v[0])) {
          const items = v.map((item: unknown) => formatValue(item, indent + 2))
          return `[\n${items.map((i: string) => ' '.repeat(indent + 2) + i).join(',\n')}\n${' '.repeat(indent)}]`
        }
        return `[${v.map((item: unknown) => formatValue(item, indent)).join(', ')}]`
      }
      if (typeof v === 'object') {
        return formatObj(v as Record<string, unknown>, indent + 2)
      }
      return String(v)
    }

    const formatObj = (obj: Record<string, unknown>, indent = 4): string => {
      const entries = Object.entries(obj).filter(
        ([, v]) => v !== undefined && v !== null
      )
      if (entries.length === 0) return '{}'
      const lines = entries.map(([k, v]) => {
        return `${' '.repeat(indent)}${k}: ${formatValue(v, indent)}`
      })
      return `{\n${lines.join(',\n')}\n${' '.repeat(indent - 2)}}`
    }
    return `  ${key}: ${formatObj(value as Record<string, unknown>, 4)},`
  }

  return null
}

// Generate vanilla JS constructor code from values
export const generateVanillaCode = (values: Values): string => {
  const props: string[] = []

  // Handle geometry specially
  if (values.geometryType && values.geometryType !== GeometryType.NONE) {
    const geoCode = geometryTypeToJSX(values.geometryType, values.geometryArgs)
    if (geoCode) {
      props.push(`  geometry: ${geoCode},`)
    }
  }

  for (const key of propOrder) {
    const value = values[key]
    if (shouldSkipDefault(key, value, values)) continue

    const formatted = formatObjectProp(key, value)
    if (formatted) props.push(formatted)
  }

  if (props.length === 0) {
    return 'const particles = new VFXParticles(renderer)'
  }

  return `const particles = new VFXParticles(renderer, {\n${props.join('\n')}\n})`
}
