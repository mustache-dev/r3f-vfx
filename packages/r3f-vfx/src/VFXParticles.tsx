import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { useVFXStore } from './react-store';
import {
  Fn,
  If,
  uniform,
  float,
  uv,
  vec2,
  vec3,
  vec4,
  hash,
  mix,
  floor,
  step,
  mod,
  texture,
  instancedArray,
  instanceIndex,
  positionLocal,
  cos,
  sin,
  atan,
  sqrt,
  acos,
  PI,
  mx_noise_vec3,
  screenUV,
  viewportDepthTexture,
  positionView,
  cameraNear,
  cameraFar,
  clamp,
} from 'three/tsl';
// Appearance enum for particle shapes
export const Appearance = Object.freeze({
  DEFAULT: 'default',
  GRADIENT: 'gradient',
  CIRCULAR: 'circular',
});

// Blending modes
export const Blending = Object.freeze({
  NORMAL: THREE.NormalBlending,
  ADDITIVE: THREE.AdditiveBlending,
  MULTIPLY: THREE.MultiplyBlending,
  SUBTRACTIVE: THREE.SubtractiveBlending,
});

// Emitter shape types
export const EmitterShape = Object.freeze({
  POINT: 0, // Single point emission
  BOX: 1, // Box/cube volume (uses startPosition ranges)
  SPHERE: 2, // Sphere surface or volume
  CONE: 3, // Cone shape (great for fire, fountains)
  DISK: 4, // Flat disk/circle
  EDGE: 5, // Line between two points
});

// Attractor types
export const AttractorType = Object.freeze({
  POINT: 0, // Pull toward a point (or push if negative strength)
  VORTEX: 1, // Swirl around an axis
});

// Easing types for curves (friction, etc.)
export const Easing = Object.freeze({
  LINEAR: 0,
  EASE_IN: 1,
  EASE_OUT: 2,
  EASE_IN_OUT: 3,
});

// Lighting/material types for geometry-based particles
export const Lighting = Object.freeze({
  BASIC: 'basic', // No lighting, flat colors (MeshBasicNodeMaterial)
  STANDARD: 'standard', // Standard PBR (MeshStandardNodeMaterial)
  PHYSICAL: 'physical', // Advanced PBR with clearcoat, transmission, etc. (MeshPhysicalNodeMaterial)
});

// Max number of attractors supported
const MAX_ATTRACTORS = 4;

// Convert hex to RGB array [0-1]
const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ]
    : [1, 1, 1];
};

// Normalize a prop to [min, max] array - if single value, use same for both
const toRange = (
  value: number | [number, number] | null | undefined,
  defaultVal: [number, number] = [0, 0]
): [number, number] => {
  if (value === undefined || value === null) return defaultVal;
  if (Array.isArray(value))
    return value.length === 2 ? value : [value[0], value[0]];
  return [value, value];
};

// Convert easing string to type number
const easingToType = (easing: string | number): number => {
  if (typeof easing === 'number') return easing;
  switch (easing) {
    case 'easeIn':
      return 1;
    case 'easeOut':
      return 2;
    case 'easeInOut':
      return 3;
    default:
      return 0; // linear
  }
};

// Convert axis string to number: 0=+X, 1=+Y, 2=+Z, 3=-X, 4=-Y, 5=-Z
const axisToNumber = (axis: string): number => {
  switch (axis) {
    case 'x':
    case '+x':
    case 'X':
    case '+X':
      return 0;
    case 'y':
    case '+y':
    case 'Y':
    case '+Y':
      return 1;
    case 'z':
    case '+z':
    case 'Z':
    case '+Z':
      return 2;
    case '-x':
    case '-X':
      return 3;
    case '-y':
    case '-Y':
      return 4;
    case '-z':
    case '-Z':
      return 5;
    default:
      return 2; // default to +Z
  }
};

// Curve baking utilities - bake spline curves to 1D textures for GPU sampling
const CURVE_RESOLUTION = 256; // Number of samples in the baked curve

// Types for curve data
type CurvePoint = {
  pos: [number, number];
  handleIn?: [number, number];
  handleOut?: [number, number];
};

type CurveData = {
  points: CurvePoint[];
} | null;

// Evaluate cubic bezier between two points with handles
const evaluateBezierSegment = (
  t: number,
  p0: [number, number],
  p1: [number, number],
  h0Out?: [number, number],
  h1In?: [number, number]
): [number, number] => {
  // p0 = start point [x, y], p1 = end point [x, y]
  // h0Out = handle out from p0 (offset), h1In = handle in to p1 (offset)
  const cp0 = p0;
  const cp1: [number, number] = [p0[0] + (h0Out?.[0] || 0), p0[1] + (h0Out?.[1] || 0)];
  const cp2: [number, number] = [p1[0] + (h1In?.[0] || 0), p1[1] + (h1In?.[1] || 0)];
  const cp3 = p1;

  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return [
    mt3 * cp0[0] + 3 * mt2 * t * cp1[0] + 3 * mt * t2 * cp2[0] + t3 * cp3[0],
    mt3 * cp0[1] + 3 * mt2 * t * cp1[1] + 3 * mt * t2 * cp2[1] + t3 * cp3[1],
  ];
};

// Find Y value for a given X on the curve using binary search
const sampleCurveAtX = (x: number, points: CurvePoint[]): number => {
  if (!points || points.length < 2) return x; // Linear fallback

  // Validate points have required data
  if (!points[0]?.pos || !points[points.length - 1]?.pos) return x;

  // Find the segment containing x
  let segmentIdx = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (
      points[i]?.pos &&
      points[i + 1]?.pos &&
      x >= points[i].pos[0] &&
      x <= points[i + 1].pos[0]
    ) {
      segmentIdx = i;
      break;
    }
  }

  const p0 = points[segmentIdx];
  const p1 = points[segmentIdx + 1];

  // Validate segment points
  if (!p0?.pos || !p1?.pos) return x;

  // Binary search for t that gives us x
  let tLow = 0,
    tHigh = 1,
    t = 0.5;
  for (let iter = 0; iter < 20; iter++) {
    const [px] = evaluateBezierSegment(
      t,
      p0.pos,
      p1.pos,
      p0.handleOut,
      p1.handleIn
    );
    if (Math.abs(px - x) < 0.0001) break;
    if (px < x) {
      tLow = t;
    } else {
      tHigh = t;
    }
    t = (tLow + tHigh) / 2;
  }

  const [, py] = evaluateBezierSegment(
    t,
    p0.pos,
    p1.pos,
    p0.handleOut,
    p1.handleIn
  );
  // Allow values outside 0-1 for overshoot effects (elastic, bounce)
  // Clamp to reasonable range to prevent extreme values
  return Math.max(-0.5, Math.min(1.5, py));
};

// Bake a curve to a Float32Array for use in DataTexture
export const bakeCurveToArray = (curveData: CurveData, resolution = CURVE_RESOLUTION): Float32Array => {
  const data = new Float32Array(resolution);

  // Validate curve data structure
  if (
    !curveData?.points ||
    !Array.isArray(curveData.points) ||
    curveData.points.length < 2
  ) {
    // Default linear curve: 1→0 (fade out over lifetime, matching default behavior)
    for (let i = 0; i < resolution; i++) {
      data[i] = 1 - i / (resolution - 1);
    }
    return data;
  }

  // Validate first and last points have pos arrays
  const firstPoint = curveData.points[0];
  const lastPoint = curveData.points[curveData.points.length - 1];
  if (
    !firstPoint?.pos ||
    !lastPoint?.pos ||
    !Array.isArray(firstPoint.pos) ||
    !Array.isArray(lastPoint.pos)
  ) {
    // Fallback to linear: 1→0 (fade out)
    for (let i = 0; i < resolution; i++) {
      data[i] = 1 - i / (resolution - 1);
    }
    return data;
  }

  for (let i = 0; i < resolution; i++) {
    const x = i / (resolution - 1); // 0 to 1
    data[i] = sampleCurveAtX(x, curveData.points);
  }

  return data;
};

// Create a combined DataTexture from multiple curve data
// R = size curve, G = opacity curve, B = velocity curve, A = rotation speed curve
export const createCombinedCurveTexture = (
  sizeCurve: CurveData,
  opacityCurve: CurveData,
  velocityCurve: CurveData,
  rotationSpeedCurve: CurveData
): THREE.DataTexture => {
  const sizeData = bakeCurveToArray(sizeCurve);
  const opacityData = bakeCurveToArray(opacityCurve);
  const velocityData = bakeCurveToArray(velocityCurve);
  const rotationSpeedData = bakeCurveToArray(rotationSpeedCurve);

  const rgba = new Float32Array(CURVE_RESOLUTION * 4);
  for (let i = 0; i < CURVE_RESOLUTION; i++) {
    rgba[i * 4] = sizeData[i]; // R - size easing
    rgba[i * 4 + 1] = opacityData[i]; // G - opacity easing
    rgba[i * 4 + 2] = velocityData[i]; // B - velocity easing
    rgba[i * 4 + 3] = rotationSpeedData[i]; // A - rotation speed easing
  }

  const tex = new THREE.DataTexture(
    rgba,
    CURVE_RESOLUTION,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
};

// Default linear curve: starts at 1, ends at 0 (fade out behavior)
// Curve Y-value is the DIRECT multiplier: y=1 means full, y=0 means none
const DEFAULT_LINEAR_CURVE = {
  points: [
    { pos: [0, 1], handleOut: [0.33, 0] },
    { pos: [1, 0], handleIn: [-0.33, 0] },
  ],
};

// Normalize rotation prop - supports:
// - Single number: rotation={0.5} → same rotation for all
// - [min, max]: rotation={[0, Math.PI]} → random in range (Y-axis for sprites, all axes for geometry)
// - [[minX, maxX], [minY, maxY], [minZ, maxZ]]: full 3D control
type Rotation3DInput =
  | number
  | [number, number]
  | [[number, number], [number, number], [number, number]]
  | null
  | undefined;

const toRotation3D = (
  value: Rotation3DInput
): [[number, number], [number, number], [number, number]] => {
  if (value === undefined || value === null)
    return [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
  if (typeof value === 'number')
    return [
      [value, value],
      [value, value],
      [value, value],
    ];
  if (Array.isArray(value)) {
    // Check if nested array [[x], [y], [z]]
    if (Array.isArray(value[0])) {
      const nested = value as [[number, number], [number, number], [number, number]];
      return [
        toRange(nested[0], [0, 0]),
        toRange(nested[1], [0, 0]),
        toRange(nested[2], [0, 0]),
      ];
    }
    // Simple [min, max] - apply to all axes
    const range = toRange(value as [number, number], [0, 0]);
    return [range, range, range];
  }
  return [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
};

// Particle data passed to custom node functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParticleData = Record<string, any>;

export type VFXParticlesProps = {
  /** Optional name for registering with useVFXStore (enables VFXEmitter linking) */
  name?: string;
  /** Maximum number of particles */
  maxParticles?: number;
  /** Particle size [min, max] or single value */
  size?: number | [number, number];
  /** Array of hex color strings for start color */
  colorStart?: string[];
  /** Array of hex color strings for end color (null = use colorStart) */
  colorEnd?: string[] | null;
  /** Fade size [start, end] multiplier over lifetime */
  fadeSize?: number | [number, number];
  /** Curve data for size over lifetime */
  fadeSizeCurve?: CurveData;
  /** Fade opacity [start, end] multiplier over lifetime */
  fadeOpacity?: number | [number, number];
  /** Curve data for opacity over lifetime */
  fadeOpacityCurve?: CurveData;
  /** Curve data for velocity over lifetime */
  velocityCurve?: CurveData;
  /** Gravity vector [x, y, z] */
  gravity?: [number, number, number];
  /** Particle lifetime in seconds [min, max] or single value */
  lifetime?: number | [number, number];
  /** Direction ranges for velocity */
  direction?: Rotation3DInput;
  /** Start position offset ranges */
  startPosition?: Rotation3DInput;
  /** Speed [min, max] or single value */
  speed?: number | [number, number];
  /** Friction settings */
  friction?: { intensity?: number | [number, number]; easing?: string };
  /** Particle appearance type */
  appearance?: (typeof Appearance)[keyof typeof Appearance];
  /** Alpha map texture */
  alphaMap?: THREE.Texture | null;
  /** Flipbook animation settings */
  flipbook?: { rows: number; columns: number } | null;
  /** Rotation [min, max] in radians or 3D rotation ranges */
  rotation?: Rotation3DInput;
  /** Rotation speed [min, max] in radians/second or 3D ranges */
  rotationSpeed?: Rotation3DInput;
  /** Curve data for rotation speed over lifetime */
  rotationSpeedCurve?: CurveData;
  /** Custom geometry for 3D particles */
  geometry?: THREE.BufferGeometry | null;
  /** Rotate geometry to face velocity direction */
  orientToDirection?: boolean;
  /** Which local axis aligns with velocity */
  orientAxis?: string;
  /** Stretch particles based on speed */
  stretchBySpeed?: { factor: number; maxStretch: number } | null;
  /** Material lighting type for geometry mode */
  lighting?: (typeof Lighting)[keyof typeof Lighting];
  /** Enable shadows on geometry instances */
  shadow?: boolean;
  /** Blending mode */
  blending?: THREE.Blending;
  /** Color intensity multiplier */
  intensity?: number;
  /** Emitter position [x, y, z] */
  position?: [number, number, number];
  /** Start emitting automatically */
  autoStart?: boolean;
  /** Delay between emissions in seconds */
  delay?: number;
  /** TSL node or function for backdrop sampling */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backdropNode?: any | ((data: ParticleData) => any) | null;
  /** TSL node or function for custom opacity */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opacityNode?: any | ((data: ParticleData) => any) | null;
  /** TSL node or function to override color */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colorNode?: any | ((data: ParticleData, defaultColor: any) => any) | null;
  /** TSL node or function for alpha test/discard */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alphaTestNode?: any | ((data: ParticleData) => any) | null;
  /** TSL node or function for shadow map output */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  castShadowNode?: any | ((data: ParticleData) => any) | null;
  /** Number of particles to emit per frame */
  emitCount?: number;
  /** Emitter shape type */
  emitterShape?: (typeof EmitterShape)[keyof typeof EmitterShape];
  /** Emitter radius [inner, outer] */
  emitterRadius?: number | [number, number];
  /** Cone angle in radians */
  emitterAngle?: number;
  /** Cone height [min, max] */
  emitterHeight?: number | [number, number];
  /** Emit from surface only */
  emitterSurfaceOnly?: boolean;
  /** Direction for cone/disk normal */
  emitterDirection?: [number, number, number];
  /** Turbulence settings */
  turbulence?: { intensity: number; frequency?: number; speed?: number } | null;
  /** Array of attractors (max 4) */
  attractors?: Array<{
    position?: [number, number, number];
    strength?: number;
    radius?: number;
    type?: 'point' | 'vortex';
    axis?: [number, number, number];
  }> | null;
  /** Particles move from spawn position to center over lifetime */
  attractToCenter?: boolean;
  /** Use start position offset as direction */
  startPositionAsDirection?: boolean;
  /** Fade particles when intersecting scene geometry */
  softParticles?: boolean;
  /** Distance over which to fade soft particles */
  softDistance?: number;
  /** Plane collision settings */
  collision?: {
    plane?: { y: number };
    bounce?: number;
    friction?: number;
    die?: boolean;
    sizeBasedGravity?: number;
  } | null;
  /** Show debug control panel */
  debug?: boolean;
};

export const VFXParticles = forwardRef<unknown, VFXParticlesProps>(function VFXParticles(
  {
    name, // Optional name for registering with useVFXStore (enables VFXEmitter linking)
    maxParticles = 10000,
    size = [0.1, 0.3],
    colorStart = ['#ffffff'],
    colorEnd = null, // If null, uses colorStart (no color transition)
    fadeSize = [1, 0],
    fadeSizeCurve = null, // Curve data { points: [...] } - controls fadeSize over lifetime (overrides fadeSize if set)
    fadeOpacity = [1, 0],
    fadeOpacityCurve = null, // Curve data { points: [...] } - controls fadeOpacity over lifetime (overrides fadeOpacity if set)
    velocityCurve = null, // Curve data { points: [...] } - controls velocity/speed over lifetime (overrides friction if set)
    gravity = [0, 0, 0],
    lifetime = [1, 2],
    direction = [
      [-1, 1],
      [0, 1],
      [-1, 1],
    ], // [[minX, maxX], [minY, maxY], [minZ, maxZ]] or [min, max] for all axes
    startPosition = [
      [0, 0],
      [0, 0],
      [0, 0],
    ], // [[minX, maxX], [minY, maxY], [minZ, maxZ]] offset from spawn position
    speed = [0.1, 0.1],
    friction = { intensity: 0, easing: 'linear' }, // { intensity: [start, end] or single value, easing: string }
    // intensity: 1 = max friction (almost stopped), 0 = no friction (normal), negative = boost/acceleration
    appearance = Appearance.GRADIENT,
    alphaMap = null,
    flipbook = null, // { rows: 4, columns: 8 }
    rotation = [0, 0], // [min, max] in radians
    rotationSpeed = [0, 0], // [min, max] rotation speed in radians/second
    rotationSpeedCurve = null, // Curve data { points: [...] } - controls rotation speed over lifetime
    geometry = null, // Custom geometry (e.g. new THREE.SphereGeometry(0.5, 8, 8))
    orientToDirection = false, // Rotate geometry to face velocity direction (geometry mode only)
    orientAxis = 'z', // Which local axis aligns with velocity: "x", "y", "z", "-x", "-y", "-z"
    stretchBySpeed = null, // { factor: 2, maxStretch: 5 } - stretch particles in velocity direction based on effective speed
    lighting = Lighting.STANDARD, // 'basic' | 'standard' | 'physical' - material type for geometry mode
    shadow = false, // Enable both castShadow and receiveShadow on geometry instances
    blending = Blending.NORMAL,
    intensity = 1,
    position = [0, 0, 0],
    autoStart = true,
    delay = 0,
    backdropNode = null, // TSL node or function for backdrop sampling
    opacityNode = null, // TSL node or function for custom opacity control
    colorNode = null, // TSL node or function to override color (receives particleData, should return vec4)
    alphaTestNode = null, // TSL node or function for custom alpha test/discard (return true to discard fragment)
    castShadowNode = null, // TSL node or function for shadow map output (what shadow the particle casts)
    emitCount = 1,
    // Emitter shape props
    emitterShape = EmitterShape.BOX, // Emission shape type
    emitterRadius = [0, 1], // [inner, outer] radius for sphere/cone/disk (inner=0 for solid)
    emitterAngle = Math.PI / 4, // Cone angle in radians (0 = line, PI/2 = hemisphere)
    emitterHeight = [0, 1], // [min, max] height for cone
    emitterSurfaceOnly = false, // Emit from surface only (sphere/disk)
    emitterDirection = [0, 1, 0], // Direction for cone/disk normal
    // Turbulence (curl noise)
    turbulence = null, // { intensity: 0.5, frequency: 1, speed: 1 }
    // Attractors - array of up to 4 attractors
    // { position: [x,y,z], strength: 1, radius: 3, type: 'point'|'vortex', axis?: [x,y,z] }
    attractors = null,
    // Simple attract to center - particles move from spawn position to center over lifetime
    // Overrides speed/direction - lifetime controls how long it takes to reach center
    attractToCenter = false,
    // Use start position offset as direction - particles move in the direction of their spawn offset
    startPositionAsDirection = false,
    // Soft particles - fade when intersecting scene geometry
    softParticles = false,
    softDistance = 0.5, // Distance in world units over which to fade
    // Plane collision - particles bounce or die when hitting a plane
    // { plane: { y: 0 }, bounce: 0.3, friction: 0.8, die: false, sizeBasedGravity: 0 }
    collision = null,
    // Debug mode - shows tweakable control panel
    debug = false,
  },
  ref
) {
  const { gl: renderer } = useThree();
  const spriteRef = useRef<THREE.Sprite | THREE.InstancedMesh | null>(null);
  const initialized = useRef(false);
  const nextIndex = useRef(0);
  const [emitting, setEmitting] = useState(autoStart);
  const emitAccumulator = useRef(0);

  // Refs for runtime values that can be updated by debug panel
  const delayRef = useRef(delay);
  const emitCountRef = useRef(emitCount);
  const turbulenceRef = useRef(turbulence);

  // State for "remount-required" values - changing these recreates GPU resources
  const [activeMaxParticles, setActiveMaxParticles] = useState(maxParticles);
  const [activeLighting, setActiveLighting] = useState(lighting);
  const [activeAppearance, setActiveAppearance] = useState(appearance);
  const [activeOrientToDirection, setActiveOrientToDirection] =
    useState(orientToDirection);
  const [activeGeometry, setActiveGeometry] = useState(geometry);
  const [activeShadow, setActiveShadow] = useState(shadow);
  const [activeFadeSizeCurve, setActiveFadeSizeCurve] = useState(fadeSizeCurve);
  const [activeFadeOpacityCurve, setActiveFadeOpacityCurve] =
    useState(fadeOpacityCurve);
  const [activeVelocityCurve, setActiveVelocityCurve] = useState(velocityCurve);
  const [activeRotationSpeedCurve, setActiveRotationSpeedCurve] =
    useState(rotationSpeedCurve);

  // Keep refs in sync with props (when not in debug mode)
  useEffect(() => {
    delayRef.current = delay;
    emitCountRef.current = emitCount;
    turbulenceRef.current = turbulence;
  }, [delay, emitCount, turbulence]);

  // Keep remount-required state in sync with props (when not in debug mode)
  useEffect(() => {
    if (!debug) {
      setActiveMaxParticles(maxParticles);
      setActiveLighting(lighting);
      setActiveAppearance(appearance);
      setActiveOrientToDirection(orientToDirection);
      setActiveGeometry(geometry);
      setActiveShadow(shadow);
      setActiveFadeSizeCurve(fadeSizeCurve);
      setActiveFadeOpacityCurve(fadeOpacityCurve);
      setActiveVelocityCurve(velocityCurve);
      setActiveRotationSpeedCurve(rotationSpeedCurve);
    }
  }, [
    debug,
    maxParticles,
    lighting,
    appearance,
    orientToDirection,
    geometry,
    shadow,
    fadeSizeCurve,
    fadeOpacityCurve,
    velocityCurve,
    rotationSpeedCurve,
  ]);

  // Convert lifetime in seconds to fade rate per second (framerate independent)
  const lifetimeToFadeRate = (seconds: number) => 1 / seconds;

  // Normalize props to [min, max] ranges
  const sizeRange = useMemo(() => toRange(size, [0.1, 0.3]), [size]);
  const speedRange = useMemo(() => toRange(speed, [0.1, 0.1]), [speed]);
  const fadeSizeRange = useMemo(() => toRange(fadeSize, [1, 0]), [fadeSize]);
  const fadeOpacityRange = useMemo(
    () => toRange(fadeOpacity, [1, 0]),
    [fadeOpacity]
  );

  // Create combined curve texture for GPU sampling (use active curves for debug mode)
  // R = size, G = opacity, B = velocity, A = rotation speed
  const curveTexture = useMemo(() => {
    return createCombinedCurveTexture(
      activeFadeSizeCurve,
      activeFadeOpacityCurve,
      activeVelocityCurve,
      activeRotationSpeedCurve
    );
  }, [
    activeFadeSizeCurve,
    activeFadeOpacityCurve,
    activeVelocityCurve,
    activeRotationSpeedCurve,
  ]);

  // Dispose curve texture when it changes or component unmounts
  const prevCurveTextureRef = useRef<THREE.DataTexture | null>(null);
  useEffect(() => {
    // Dispose previous texture if it changed
    if (
      prevCurveTextureRef.current &&
      prevCurveTextureRef.current !== curveTexture
    ) {
      prevCurveTextureRef.current.dispose();
    }
    prevCurveTextureRef.current = curveTexture;

    return () => {
      if (curveTexture) {
        curveTexture.dispose();
      }
    };
  }, [curveTexture]);
  const lifetimeRange = useMemo(() => toRange(lifetime, [1, 2]), [lifetime]);
  const rotation3D = useMemo(() => toRotation3D(rotation), [rotation]);
  const rotationSpeed3D = useMemo(
    () => toRotation3D(rotationSpeed),
    [rotationSpeed]
  );
  const direction3D = useMemo(() => toRotation3D(direction), [direction]);
  const startPosition3D = useMemo(
    () => toRotation3D(startPosition),
    [startPosition]
  );
  const emitterRadiusRange = useMemo(
    () => toRange(emitterRadius, [0, 1]),
    [emitterRadius]
  );
  const emitterHeightRange = useMemo(
    () => toRange(emitterHeight, [0, 1]),
    [emitterHeight]
  );

  // Parse friction object: { intensity: [start, end] or single value, easing: string }
  const frictionIntensityRange = useMemo(() => {
    if (
      typeof friction === 'object' &&
      friction !== null &&
      'intensity' in friction
    ) {
      return toRange(friction.intensity, [0, 0]);
    }
    return [0, 0]; // Default: no friction
  }, [friction]);
  const frictionEasingType = useMemo(() => {
    if (
      typeof friction === 'object' &&
      friction !== null &&
      'easing' in friction
    ) {
      return easingToType(friction.easing ?? 'linear');
    }
    return 0; // linear
  }, [friction]);

  // Convert color arrays to RGB (support up to 8 colors each)
  const startColors = useMemo(() => {
    const colors = colorStart.slice(0, 8).map(hexToRgb);
    while (colors.length < 8)
      colors.push(colors[colors.length - 1] || [1, 1, 1]);
    return colors;
  }, [colorStart]);

  // Use colorStart if colorEnd is not provided (no color transition)
  const effectiveColorEnd = colorEnd ?? colorStart;

  const endColors = useMemo(() => {
    const colors = effectiveColorEnd.slice(0, 8).map(hexToRgb);
    while (colors.length < 8)
      colors.push(colors[colors.length - 1] || [1, 1, 1]);
    return colors;
  }, [effectiveColorEnd]);

  // Uniforms
  const uniforms = useMemo(
    () => ({
      sizeMin: uniform(sizeRange[0]),
      sizeMax: uniform(sizeRange[1]),
      fadeSizeStart: uniform(fadeSizeRange[0]),
      fadeSizeEnd: uniform(fadeSizeRange[1]),
      fadeOpacityStart: uniform(fadeOpacityRange[0]),
      fadeOpacityEnd: uniform(fadeOpacityRange[1]),
      gravity: uniform(new THREE.Vector3(...gravity)),
      frictionIntensityStart: uniform(frictionIntensityRange[0]),
      frictionIntensityEnd: uniform(frictionIntensityRange[1]),
      frictionEasingType: uniform(frictionEasingType),
      speedMin: uniform(speedRange[0]),
      speedMax: uniform(speedRange[1]),
      lifetimeMin: uniform(lifetimeToFadeRate(lifetimeRange[1])),
      lifetimeMax: uniform(lifetimeToFadeRate(lifetimeRange[0])),
      deltaTime: uniform(0.016), // Will be updated each frame
      // 3D direction ranges
      dirMinX: uniform(direction3D[0][0]),
      dirMaxX: uniform(direction3D[0][1]),
      dirMinY: uniform(direction3D[1][0]),
      dirMaxY: uniform(direction3D[1][1]),
      dirMinZ: uniform(direction3D[2][0]),
      dirMaxZ: uniform(direction3D[2][1]),
      // 3D start position offset ranges
      startPosMinX: uniform(startPosition3D[0][0]),
      startPosMaxX: uniform(startPosition3D[0][1]),
      startPosMinY: uniform(startPosition3D[1][0]),
      startPosMaxY: uniform(startPosition3D[1][1]),
      startPosMinZ: uniform(startPosition3D[2][0]),
      startPosMaxZ: uniform(startPosition3D[2][1]),
      spawnPosition: uniform(new THREE.Vector3(...position)),
      spawnIndexStart: uniform(0),
      spawnIndexEnd: uniform(0),
      spawnSeed: uniform(0),
      intensity: uniform(intensity),
      // 3D rotation ranges
      rotationMinX: uniform(rotation3D[0][0]),
      rotationMaxX: uniform(rotation3D[0][1]),
      rotationMinY: uniform(rotation3D[1][0]),
      rotationMaxY: uniform(rotation3D[1][1]),
      rotationMinZ: uniform(rotation3D[2][0]),
      rotationMaxZ: uniform(rotation3D[2][1]),
      // 3D rotation speed ranges (radians/second)
      rotationSpeedMinX: uniform(rotationSpeed3D[0][0]),
      rotationSpeedMaxX: uniform(rotationSpeed3D[0][1]),
      rotationSpeedMinY: uniform(rotationSpeed3D[1][0]),
      rotationSpeedMaxY: uniform(rotationSpeed3D[1][1]),
      rotationSpeedMinZ: uniform(rotationSpeed3D[2][0]),
      rotationSpeedMaxZ: uniform(rotationSpeed3D[2][1]),
      // Color arrays (8 colors max each)
      colorStartCount: uniform(colorStart.length),
      colorEndCount: uniform(effectiveColorEnd.length),
      colorStart0: uniform(new THREE.Color(...startColors[0])),
      colorStart1: uniform(new THREE.Color(...startColors[1])),
      colorStart2: uniform(new THREE.Color(...startColors[2])),
      colorStart3: uniform(new THREE.Color(...startColors[3])),
      colorStart4: uniform(new THREE.Color(...startColors[4])),
      colorStart5: uniform(new THREE.Color(...startColors[5])),
      colorStart6: uniform(new THREE.Color(...startColors[6])),
      colorStart7: uniform(new THREE.Color(...startColors[7])),
      colorEnd0: uniform(new THREE.Color(...endColors[0])),
      colorEnd1: uniform(new THREE.Color(...endColors[1])),
      colorEnd2: uniform(new THREE.Color(...endColors[2])),
      colorEnd3: uniform(new THREE.Color(...endColors[3])),
      colorEnd4: uniform(new THREE.Color(...endColors[4])),
      colorEnd5: uniform(new THREE.Color(...endColors[5])),
      colorEnd6: uniform(new THREE.Color(...endColors[6])),
      colorEnd7: uniform(new THREE.Color(...endColors[7])),
      // Emitter shape uniforms
      emitterShapeType: uniform(emitterShape),
      emitterRadiusInner: uniform(emitterRadiusRange[0]),
      emitterRadiusOuter: uniform(emitterRadiusRange[1]),
      emitterAngle: uniform(emitterAngle),
      emitterHeightMin: uniform(emitterHeightRange[0]),
      emitterHeightMax: uniform(emitterHeightRange[1]),
      emitterSurfaceOnly: uniform(emitterSurfaceOnly ? 1 : 0),
      emitterDir: uniform(new THREE.Vector3(...emitterDirection).normalize()),
      // Turbulence uniforms
      turbulenceIntensity: uniform(turbulence?.intensity ?? 0),
      turbulenceFrequency: uniform(turbulence?.frequency ?? 1),
      turbulenceSpeed: uniform(turbulence?.speed ?? 1),
      turbulenceTime: uniform(0), // Updated each frame
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
      attractToCenter: uniform(attractToCenter ? 1 : 0),
      // Use start position as direction
      startPositionAsDirection: uniform(startPositionAsDirection ? 1 : 0),
      // Soft particles
      softParticlesEnabled: uniform(softParticles ? 1 : 0),
      softDistance: uniform(softDistance),
      // Velocity curve (replaces friction when enabled)
      velocityCurveEnabled: uniform(velocityCurve ? 1 : 0),
      // Rotation speed curve (modulates rotation speed over lifetime)
      rotationSpeedCurveEnabled: uniform(rotationSpeedCurve ? 1 : 0),
      // Fade size curve (when disabled, uses fadeSize prop interpolation)
      fadeSizeCurveEnabled: uniform(fadeSizeCurve ? 1 : 0),
      // Fade opacity curve (when disabled, uses fadeOpacity prop interpolation)
      fadeOpacityCurveEnabled: uniform(fadeOpacityCurve ? 1 : 0),
      // Orient axis: 0=+X, 1=+Y, 2=+Z, 3=-X, 4=-Y, 5=-Z
      orientAxisType: uniform(axisToNumber(orientAxis)),
      // Stretch by speed (uses effective velocity after curve modifier)
      stretchEnabled: uniform(stretchBySpeed ? 1 : 0),
      stretchFactor: uniform(stretchBySpeed?.factor ?? 1),
      stretchMax: uniform(stretchBySpeed?.maxStretch ?? 5),
      // Collision uniforms
      collisionEnabled: uniform(collision ? 1 : 0),
      collisionPlaneY: uniform(collision?.plane?.y ?? 0),
      collisionBounce: uniform(collision?.bounce ?? 0.3),
      collisionFriction: uniform(collision?.friction ?? 0.8),
      collisionDie: uniform(collision?.die ? 1 : 0),
      // Size-based gravity (inside collision object)
      sizeBasedGravity: uniform(collision?.sizeBasedGravity ?? 0),
    }),
    []
  );

  // Store position prop for use in spawn
  const positionRef = useRef(position);

  // Update all uniforms when props change (skip in debug mode - debug panel handles this)
  useEffect(() => {
    // In debug mode, the debug panel controls uniform values via handleDebugUpdate
    // Skip this effect to avoid overwriting user changes from the panel
    if (debug) return;

    positionRef.current = position;

    // Size
    uniforms.sizeMin.value = sizeRange[0];
    uniforms.sizeMax.value = sizeRange[1];

    // Fade
    uniforms.fadeSizeStart.value = fadeSizeRange[0];
    uniforms.fadeSizeEnd.value = fadeSizeRange[1];
    uniforms.fadeOpacityStart.value = fadeOpacityRange[0];
    uniforms.fadeOpacityEnd.value = fadeOpacityRange[1];

    // Physics
    uniforms.gravity.value.set(...gravity);
    uniforms.frictionIntensityStart.value = frictionIntensityRange[0];
    uniforms.frictionIntensityEnd.value = frictionIntensityRange[1];
    uniforms.frictionEasingType.value = frictionEasingType;
    uniforms.speedMin.value = speedRange[0];
    uniforms.speedMax.value = speedRange[1];

    // Lifetime
    uniforms.lifetimeMin.value = lifetimeToFadeRate(lifetimeRange[1]);
    uniforms.lifetimeMax.value = lifetimeToFadeRate(lifetimeRange[0]);

    // Direction
    // 3D Direction
    uniforms.dirMinX.value = direction3D[0][0];
    uniforms.dirMaxX.value = direction3D[0][1];
    uniforms.dirMinY.value = direction3D[1][0];
    uniforms.dirMaxY.value = direction3D[1][1];
    uniforms.dirMinZ.value = direction3D[2][0];
    uniforms.dirMaxZ.value = direction3D[2][1];

    // Start position offset
    // 3D Start Position
    uniforms.startPosMinX.value = startPosition3D[0][0];
    uniforms.startPosMaxX.value = startPosition3D[0][1];
    uniforms.startPosMinY.value = startPosition3D[1][0];
    uniforms.startPosMaxY.value = startPosition3D[1][1];
    uniforms.startPosMinZ.value = startPosition3D[2][0];
    uniforms.startPosMaxZ.value = startPosition3D[2][1];

    // 3D Rotation
    uniforms.rotationMinX.value = rotation3D[0][0];
    uniforms.rotationMaxX.value = rotation3D[0][1];
    uniforms.rotationMinY.value = rotation3D[1][0];
    uniforms.rotationMaxY.value = rotation3D[1][1];
    uniforms.rotationMinZ.value = rotation3D[2][0];
    uniforms.rotationMaxZ.value = rotation3D[2][1];

    // 3D Rotation Speed
    uniforms.rotationSpeedMinX.value = rotationSpeed3D[0][0];
    uniforms.rotationSpeedMaxX.value = rotationSpeed3D[0][1];
    uniforms.rotationSpeedMinY.value = rotationSpeed3D[1][0];
    uniforms.rotationSpeedMaxY.value = rotationSpeed3D[1][1];
    uniforms.rotationSpeedMinZ.value = rotationSpeed3D[2][0];
    uniforms.rotationSpeedMaxZ.value = rotationSpeed3D[2][1];

    // Intensity
    uniforms.intensity.value = intensity;

    // Colors
    uniforms.colorStartCount.value = colorStart.length;
    uniforms.colorEndCount.value = effectiveColorEnd.length;
    startColors.forEach((c: [number, number, number], i: number) => {
      (uniforms as unknown as Record<string, { value: THREE.Color }>)[`colorStart${i}`]?.value.setRGB(...c);
    });
    endColors.forEach((c: [number, number, number], i: number) => {
      (uniforms as unknown as Record<string, { value: THREE.Color }>)[`colorEnd${i}`]?.value.setRGB(...c);
    });

    // Emitter shape
    uniforms.emitterShapeType.value = emitterShape;
    uniforms.emitterRadiusInner.value = emitterRadiusRange[0];
    uniforms.emitterRadiusOuter.value = emitterRadiusRange[1];
    uniforms.emitterAngle.value = emitterAngle;
    uniforms.emitterHeightMin.value = emitterHeightRange[0];
    uniforms.emitterHeightMax.value = emitterHeightRange[1];
    uniforms.emitterSurfaceOnly.value = emitterSurfaceOnly ? 1 : 0;
    uniforms.emitterDir.value.set(...emitterDirection).normalize();

    // Turbulence
    uniforms.turbulenceIntensity.value = turbulence?.intensity ?? 0;
    uniforms.turbulenceFrequency.value = turbulence?.frequency ?? 1;
    uniforms.turbulenceSpeed.value = turbulence?.speed ?? 1;

    // Attractors
    const attractorList = attractors ?? [];
    uniforms.attractorCount.value = Math.min(
      attractorList.length,
      MAX_ATTRACTORS
    );
    for (let i = 0; i < MAX_ATTRACTORS; i++) {
      const a = attractorList[i];
      // @ts-expect-error - Dynamic uniform indexing
      const u = uniforms as Record<string, { value: THREE.Vector3 | number }>;
      if (a) {
        (u[`attractor${i}Pos`].value as THREE.Vector3).set(...(a.position ?? [0, 0, 0]));
        u[`attractor${i}Strength`].value = a.strength ?? 1;
        u[`attractor${i}Radius`].value = a.radius ?? 0; // 0 = infinite
        u[`attractor${i}Type`].value = a.type === 'vortex' ? 1 : 0;
        (u[`attractor${i}Axis`].value as THREE.Vector3)
          .set(...(a.axis ?? [0, 1, 0]))
          .normalize();
      } else {
        u[`attractor${i}Strength`].value = 0;
      }
    }

    // Simple attract to center
    uniforms.attractToCenter.value = attractToCenter ? 1 : 0;

    // Start position as direction
    uniforms.startPositionAsDirection.value = startPositionAsDirection ? 1 : 0;

    // Soft particles
    uniforms.softParticlesEnabled.value = softParticles ? 1 : 0;
    uniforms.softDistance.value = softDistance;

    // Velocity curve (when enabled, overrides friction)
    uniforms.velocityCurveEnabled.value = velocityCurve ? 1 : 0;

    // Rotation speed curve
    uniforms.rotationSpeedCurveEnabled.value = rotationSpeedCurve ? 1 : 0;

    // Fade size curve (when enabled, uses curve instead of fadeSize prop)
    uniforms.fadeSizeCurveEnabled.value = fadeSizeCurve ? 1 : 0;

    // Fade opacity curve (when enabled, uses curve instead of fadeOpacity prop)
    uniforms.fadeOpacityCurveEnabled.value = fadeOpacityCurve ? 1 : 0;

    // Orient axis
    uniforms.orientAxisType.value = axisToNumber(orientAxis);

    // Stretch by speed
    uniforms.stretchEnabled.value = stretchBySpeed ? 1 : 0;
    uniforms.stretchFactor.value = stretchBySpeed?.factor ?? 1;
    uniforms.stretchMax.value = stretchBySpeed?.maxStretch ?? 5;

    // Collision
    uniforms.collisionEnabled.value = collision ? 1 : 0;
    uniforms.collisionPlaneY.value = collision?.plane?.y ?? 0;
    uniforms.collisionBounce.value = collision?.bounce ?? 0.3;
    uniforms.collisionFriction.value = collision?.friction ?? 0.8;
    uniforms.collisionDie.value = collision?.die ? 1 : 0;
    uniforms.sizeBasedGravity.value = collision?.sizeBasedGravity ?? 0;
  }, [
    debug,
    position,
    sizeRange,
    fadeSizeRange,
    fadeOpacityRange,
    gravity,
    frictionIntensityRange,
    frictionEasingType,
    speedRange,
    lifetimeRange,
    direction3D,
    rotation3D,
    rotationSpeed3D,
    intensity,
    colorStart,
    effectiveColorEnd,
    startColors,
    endColors,
    uniforms,
    collision,
    emitterShape,
    emitterRadiusRange,
    emitterAngle,
    emitterHeightRange,
    emitterSurfaceOnly,
    emitterDirection,
    turbulence,
    startPosition3D,
    attractors,
    attractToCenter,
    startPositionAsDirection,
    softParticles,
    softDistance,
    velocityCurve,
    rotationSpeedCurve,
    fadeSizeCurve,
    fadeOpacityCurve,
    orientAxis,
    stretchBySpeed,
  ]);

  // GPU Storage arrays
  const {
    positions,
    velocities,
    lifetimes,
    fadeRates,
    particleSizes,
    particleRotations,
    particleColorStarts,
    particleColorEnds,
  } = useMemo(
    () => ({
      positions: instancedArray(activeMaxParticles, 'vec3'),
      velocities: instancedArray(activeMaxParticles, 'vec3'),
      lifetimes: instancedArray(activeMaxParticles, 'float'),
      fadeRates: instancedArray(activeMaxParticles, 'float'),
      particleSizes: instancedArray(activeMaxParticles, 'float'),
      particleRotations: instancedArray(activeMaxParticles, 'vec3'), // X, Y, Z rotations
      particleColorStarts: instancedArray(activeMaxParticles, 'vec3'),
      particleColorEnds: instancedArray(activeMaxParticles, 'vec3'),
    }),
    [activeMaxParticles]
  );

  // Helper to select color from array based on index
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectColor = (idx: any, c0: any, c1: any, c2: any, c3: any, c4: any, c5: any, c6: any, c7: any) => {
    return idx
      .lessThan(1)
      .select(
        c0,
        idx
          .lessThan(2)
          .select(
            c1,
            idx
              .lessThan(3)
              .select(
                c2,
                idx
                  .lessThan(4)
                  .select(
                    c3,
                    idx
                      .lessThan(5)
                      .select(
                        c4,
                        idx
                          .lessThan(6)
                          .select(c5, idx.lessThan(7).select(c6, c7))
                      )
                  )
              )
          )
      );
  };

  // Initialize all particles as dead
  const computeInit = useMemo(() => {
    return Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);
      const lifetime = lifetimes.element(instanceIndex);
      const fadeRate = fadeRates.element(instanceIndex);
      const particleSize = particleSizes.element(instanceIndex);
      const particleRotation = particleRotations.element(instanceIndex);
      const colorStart = particleColorStarts.element(instanceIndex);
      const colorEnd = particleColorEnds.element(instanceIndex);

      position.assign(vec3(0, -1000, 0));
      velocity.assign(vec3(0, 0, 0));
      lifetime.assign(float(0));
      fadeRate.assign(float(0));
      particleSize.assign(float(0));
      particleRotation.assign(vec3(0, 0, 0));
      colorStart.assign(vec3(1, 1, 1));
      colorEnd.assign(vec3(1, 1, 1));
    })().compute(activeMaxParticles);
  }, [
    activeMaxParticles,
    positions,
    velocities,
    lifetimes,
    fadeRates,
    particleSizes,
    particleRotations,
    particleColorStarts,
    particleColorEnds,
  ]);

  // Spawn compute shader
  const computeSpawn = useMemo(() => {
    return Fn(() => {
      const idx = float(instanceIndex);
      const startIdx = uniforms.spawnIndexStart;
      const endIdx = uniforms.spawnIndexEnd;
      const seed = uniforms.spawnSeed;

      const inRange = startIdx
        .lessThan(endIdx)
        .select(
          idx.greaterThanEqual(startIdx).and(idx.lessThan(endIdx)),
          idx.greaterThanEqual(startIdx).or(idx.lessThan(endIdx))
        );

      If(inRange, () => {
        const position = positions.element(instanceIndex);
        const velocity = velocities.element(instanceIndex);
        const lifetime = lifetimes.element(instanceIndex);
        const fadeRate = fadeRates.element(instanceIndex);
        const particleSize = particleSizes.element(instanceIndex);
        const particleRotation = particleRotations.element(instanceIndex);
        const pColorStart = particleColorStarts.element(instanceIndex);
        const pColorEnd = particleColorEnds.element(instanceIndex);

        // Unique random per particle
        const particleSeed = idx.add(seed);
        const randDirX = hash(particleSeed.add(333));
        const randDirY = hash(particleSeed.add(444));
        const randDirZ = hash(particleSeed.add(555));
        const randFade = hash(particleSeed.add(666));
        const randColorStart = hash(particleSeed.add(777));
        const randColorEnd = hash(particleSeed.add(888));
        const randSize = hash(particleSeed.add(999));
        const randSpeed = hash(particleSeed.add(1111));
        const randRotationX = hash(particleSeed.add(2222));
        const randRotationY = hash(particleSeed.add(3333));
        const randRotationZ = hash(particleSeed.add(4444));
        const randPosX = hash(particleSeed.add(5555));
        const randPosY = hash(particleSeed.add(6666));
        const randPosZ = hash(particleSeed.add(7777));
        const randRadius = hash(particleSeed.add(8880));
        const randTheta = hash(particleSeed.add(9990));
        const randPhi = hash(particleSeed.add(10100));
        const randHeight = hash(particleSeed.add(11110));

        // Calculate position based on emitter shape
        const shapeType = uniforms.emitterShapeType;
        const radiusInner = uniforms.emitterRadiusInner;
        const radiusOuter = uniforms.emitterRadiusOuter;
        const coneAngle = uniforms.emitterAngle;
        const heightMin = uniforms.emitterHeightMin;
        const heightMax = uniforms.emitterHeightMax;
        const surfaceOnly = uniforms.emitterSurfaceOnly;
        const emitDir = uniforms.emitterDir;

        // Theta: full rotation around Y axis (0 to 2*PI)
        const theta = randTheta.mul(PI.mul(2));

        // For sphere: phi is the vertical angle (0 to PI for full sphere)
        // Using acos for uniform distribution on sphere surface
        const phi = acos(float(1).sub(randPhi.mul(2)));

        // Radius interpolation (inner to outer, with optional surface-only)
        // For volume: use cube root for uniform volume distribution
        // For surface: use outer radius only
        const radiusT = surfaceOnly.greaterThan(0.5).select(
          float(1),
          randRadius.pow(float(1).div(3)) // Cube root for uniform volume
        );
        const radius = mix(radiusInner, radiusOuter, radiusT);

        // === SHAPE CALCULATIONS ===

        // Pre-compute rotation values for emitDir (rotate from Y-up to emitDir)
        // Dot product with Y axis
        const cosAngle = emitDir.y;
        // Cross product: (0,1,0) × emitDir = (-emitDir.z, 0, emitDir.x)
        const axisX = emitDir.z.negate();
        const axisZ = emitDir.x;
        const axisLenSq = axisX.mul(axisX).add(axisZ.mul(axisZ));
        const axisLen = sqrt(axisLenSq.max(0.0001)); // Avoid division by zero
        const kx = axisX.div(axisLen);
        const kz = axisZ.div(axisLen);
        const sinAngle = axisLen;
        const oneMinusCos = float(1).sub(cosAngle);

        // Helper: rotate a vector from Y-up to align with emitDir
        // Using Rodrigues' rotation formula simplified for rotating from (0,1,0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rotateToEmitDir = (localPos: any) => {
          // k × localPos where k = (kx, 0, kz)
          const crossX = kz.mul(localPos.y).negate();
          const crossY = kz.mul(localPos.x).sub(kx.mul(localPos.z));
          const crossZ = kx.mul(localPos.y);

          // k · localPos
          const kDotV = kx.mul(localPos.x).add(kz.mul(localPos.z));

          // Rodrigues rotation
          const rotatedX = localPos.x
            .mul(cosAngle)
            .add(crossX.mul(sinAngle))
            .add(kx.mul(kDotV).mul(oneMinusCos));
          const rotatedY = localPos.y.mul(cosAngle).add(crossY.mul(sinAngle));
          const rotatedZ = localPos.z
            .mul(cosAngle)
            .add(crossZ.mul(sinAngle))
            .add(kz.mul(kDotV).mul(oneMinusCos));

          // If emitDir is nearly parallel to Y, use simpler logic
          return cosAngle
            .greaterThan(0.999)
            .select(
              localPos,
              cosAngle
                .lessThan(-0.999)
                .select(
                  vec3(localPos.x, localPos.y.negate(), localPos.z),
                  vec3(rotatedX, rotatedY, rotatedZ)
                )
            );
        };

        // BOX (shape 1): use startPosition ranges
        const boxOffsetX = mix(
          uniforms.startPosMinX,
          uniforms.startPosMaxX,
          randPosX
        );
        const boxOffsetY = mix(
          uniforms.startPosMinY,
          uniforms.startPosMaxY,
          randPosY
        );
        const boxOffsetZ = mix(
          uniforms.startPosMinZ,
          uniforms.startPosMaxZ,
          randPosZ
        );
        const boxPos = vec3(boxOffsetX, boxOffsetY, boxOffsetZ);

        // SPHERE (shape 2): spherical coordinates
        const sphereX = radius.mul(sin(phi)).mul(cos(theta));
        const sphereY = radius.mul(cos(phi));
        const sphereZ = radius.mul(sin(phi)).mul(sin(theta));
        const spherePos = vec3(sphereX, sphereY, sphereZ);

        // CONE (shape 3): emit within cone angle, with height
        // Cone points along emitDir, angle is half-angle from center
        const coneH = mix(heightMin, heightMax, randHeight);
        const coneR = coneH.mul(sin(coneAngle)).mul(radiusT);
        const coneLocalX = coneR.mul(cos(theta));
        const coneLocalY = coneH.mul(cos(coneAngle));
        const coneLocalZ = coneR.mul(sin(theta));
        const conePos = rotateToEmitDir(
          vec3(coneLocalX, coneLocalY, coneLocalZ)
        );

        // DISK (shape 4): flat circle on XZ plane, then rotated to emitDir
        const diskR = surfaceOnly.greaterThan(0.5).select(
          radiusOuter,
          mix(radiusInner, radiusOuter, sqrt(randRadius)) // sqrt for uniform area distribution
        );
        const diskLocalX = diskR.mul(cos(theta));
        const diskLocalZ = diskR.mul(sin(theta));
        // Disk is in XZ plane (Y=0), rotate so Y-up becomes emitDir
        const diskPos = rotateToEmitDir(vec3(diskLocalX, float(0), diskLocalZ));

        // EDGE (shape 5): line between startPosMin and startPosMax
        const edgeT = randPosX;
        const edgePos = vec3(
          mix(uniforms.startPosMinX, uniforms.startPosMaxX, edgeT),
          mix(uniforms.startPosMinY, uniforms.startPosMaxY, edgeT),
          mix(uniforms.startPosMinZ, uniforms.startPosMaxZ, edgeT)
        );

        // POINT (shape 0): no offset
        const pointPos = vec3(0, 0, 0);

        // Select position based on shape type
        const shapeOffset = shapeType.lessThan(0.5).select(
          pointPos, // 0: POINT
          shapeType.lessThan(1.5).select(
            boxPos, // 1: BOX
            shapeType.lessThan(2.5).select(
              spherePos, // 2: SPHERE
              shapeType.lessThan(3.5).select(
                conePos, // 3: CONE
                shapeType.lessThan(4.5).select(
                  diskPos, // 4: DISK
                  edgePos // 5: EDGE
                )
              )
            )
          )
        );

        position.assign(uniforms.spawnPosition.add(shapeOffset));

        // Random fade rate (needed before velocity calc for attractToCenter)
        const randomFade = mix(
          uniforms.lifetimeMin,
          uniforms.lifetimeMax,
          randFade
        );
        fadeRate.assign(randomFade);

        // Velocity calculation
        const useAttractToCenter = uniforms.attractToCenter.greaterThan(0.5);

        // AttractToCenter: velocity = -shapeOffset * fadeRate
        // This makes particles reach center exactly when they die (velocity in units/sec)
        const attractVelocity = shapeOffset.negate().mul(randomFade);

        // Normal velocity: random direction * speed OR start position as direction
        const useStartPosAsDir =
          uniforms.startPositionAsDirection.greaterThan(0.5);

        // Random direction (default behavior)
        const dirX = mix(uniforms.dirMinX, uniforms.dirMaxX, randDirX);
        const dirY = mix(uniforms.dirMinY, uniforms.dirMaxY, randDirY);
        const dirZ = mix(uniforms.dirMinZ, uniforms.dirMaxZ, randDirZ);
        const randomDirVec = vec3(dirX, dirY, dirZ);
        const randomDirLength = randomDirVec.length();
        const randomDir = randomDirLength
          .greaterThan(0.001)
          .select(randomDirVec.div(randomDirLength), vec3(0, 0, 0));

        // Start position as direction (normalized shapeOffset)
        const startPosLength = shapeOffset.length();
        const startPosDir = startPosLength
          .greaterThan(0.001)
          .select(shapeOffset.div(startPosLength), vec3(0, 0, 0));

        // Select direction based on mode
        const dir = useStartPosAsDir.select(startPosDir, randomDir);

        const randomSpeed = mix(
          uniforms.speedMin,
          uniforms.speedMax,
          randSpeed
        );
        const normalVelocity = dir.mul(randomSpeed);

        // Select velocity mode
        velocity.assign(
          useAttractToCenter.select(attractVelocity, normalVelocity)
        );

        // Random size between min and max
        const randomSize = mix(uniforms.sizeMin, uniforms.sizeMax, randSize);
        particleSize.assign(randomSize);

        // Random 3D rotation between min and max for each axis
        const rotX = mix(
          uniforms.rotationMinX,
          uniforms.rotationMaxX,
          randRotationX
        );
        const rotY = mix(
          uniforms.rotationMinY,
          uniforms.rotationMaxY,
          randRotationY
        );
        const rotZ = mix(
          uniforms.rotationMinZ,
          uniforms.rotationMaxZ,
          randRotationZ
        );
        particleRotation.assign(vec3(rotX, rotY, rotZ));

        // Pick random start color from array
        const startColorIdx = floor(
          randColorStart.mul(uniforms.colorStartCount)
        );
        const selectedStartColor = selectColor(
          startColorIdx,
          uniforms.colorStart0,
          uniforms.colorStart1,
          uniforms.colorStart2,
          uniforms.colorStart3,
          uniforms.colorStart4,
          uniforms.colorStart5,
          uniforms.colorStart6,
          uniforms.colorStart7
        );
        pColorStart.assign(selectedStartColor);

        // Pick random end color from array
        const endColorIdx = floor(randColorEnd.mul(uniforms.colorEndCount));
        const selectedEndColor = selectColor(
          endColorIdx,
          uniforms.colorEnd0,
          uniforms.colorEnd1,
          uniforms.colorEnd2,
          uniforms.colorEnd3,
          uniforms.colorEnd4,
          uniforms.colorEnd5,
          uniforms.colorEnd6,
          uniforms.colorEnd7
        );
        pColorEnd.assign(selectedEndColor);

        lifetime.assign(float(1));
      });
    })().compute(activeMaxParticles);
  }, [
    activeMaxParticles,
    positions,
    velocities,
    lifetimes,
    fadeRates,
    particleSizes,
    particleRotations,
    particleColorStarts,
    particleColorEnds,
    uniforms,
    selectColor,
  ]);

  // Update particles each frame (framerate independent)
  const computeUpdate = useMemo(() => {
    return Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);
      const lifetime = lifetimes.element(instanceIndex);
      const fadeRate = fadeRates.element(instanceIndex);
      const particleRotation = particleRotations.element(instanceIndex);
      const particleSize = particleSizes.element(instanceIndex);
      const dt = uniforms.deltaTime;

      If(lifetime.greaterThan(0), () => {
        // All operations use deltaTime for framerate independence
        // Size-based gravity: gravity * (1 + size * sizeBasedGravity)
        const gravityMultiplier = float(1).add(
          particleSize.mul(uniforms.sizeBasedGravity)
        );
        velocity.addAssign(uniforms.gravity.mul(dt).mul(gravityMultiplier));

        // Velocity control: either via curve texture or friction
        // Calculate particle progress (0 at birth, 1 at death)
        const progress = float(1).sub(lifetime);

        // Sample velocity curve from B channel of combined texture (R=size, G=opacity, B=velocity)
        // Velocity curve value: 1 = full speed, 0 = stopped
        const velocityCurveSample = texture(
          curveTexture,
          vec2(progress, float(0.5))
        ).z;

        // Choose between velocity curve (if enabled) or friction (legacy)
        const speedScale = uniforms.velocityCurveEnabled
          .greaterThan(0.5)
          .select(
            // Use velocity curve directly as speed multiplier
            velocityCurveSample,
            // Legacy friction behavior
            (() => {
              // Apply easing function based on frictionEasingType
              // 0 = linear, 1 = easeIn, 2 = easeOut, 3 = easeInOut
              const easingType = uniforms.frictionEasingType;
              const easedProgress = easingType
                .lessThan(0.5)
                .select(
                  progress,
                  easingType
                    .lessThan(1.5)
                    .select(
                      progress.mul(progress),
                      easingType
                        .lessThan(2.5)
                        .select(
                          float(1).sub(
                            float(1).sub(progress).mul(float(1).sub(progress))
                          ),
                          progress
                            .lessThan(0.5)
                            .select(
                              float(2).mul(progress).mul(progress),
                              float(1).sub(
                                float(-2).mul(progress).add(2).pow(2).div(2)
                              )
                            )
                        )
                    )
                );
              // Interpolate friction intensity
              const currentIntensity = mix(
                uniforms.frictionIntensityStart,
                uniforms.frictionIntensityEnd,
                easedProgress
              );
              // Map intensity to speed scale
              return float(1).sub(currentIntensity.mul(0.9));
            })()
          );

        // Curl noise turbulence
        const turbIntensity = uniforms.turbulenceIntensity;
        const turbFreq = uniforms.turbulenceFrequency;
        const turbTime = uniforms.turbulenceTime;

        // Only apply if turbulence intensity > 0
        If(turbIntensity.greaterThan(0.001), () => {
          // Sample position in noise space (scaled by frequency, offset by time)
          const noisePos = position
            .mul(turbFreq)
            .add(vec3(turbTime, turbTime.mul(0.7), turbTime.mul(1.3)));

          // Compute curl of noise field using finite differences
          // curl(F) = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
          const eps = float(0.01); // Small offset for derivatives

          // Sample noise at offset positions for partial derivatives
          const nPosX = mx_noise_vec3(noisePos.add(vec3(eps, 0, 0)));
          const nNegX = mx_noise_vec3(noisePos.sub(vec3(eps, 0, 0)));
          const nPosY = mx_noise_vec3(noisePos.add(vec3(0, eps, 0)));
          const nNegY = mx_noise_vec3(noisePos.sub(vec3(0, eps, 0)));
          const nPosZ = mx_noise_vec3(noisePos.add(vec3(0, 0, eps)));
          const nNegZ = mx_noise_vec3(noisePos.sub(vec3(0, 0, eps)));

          // Compute partial derivatives
          const dFx_dy = nPosY.x.sub(nNegY.x).div(eps.mul(2));
          const dFx_dz = nPosZ.x.sub(nNegZ.x).div(eps.mul(2));
          const dFy_dx = nPosX.y.sub(nNegX.y).div(eps.mul(2));
          const dFy_dz = nPosZ.y.sub(nNegZ.y).div(eps.mul(2));
          const dFz_dx = nPosX.z.sub(nNegX.z).div(eps.mul(2));
          const dFz_dy = nPosY.z.sub(nNegY.z).div(eps.mul(2));

          // Curl = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
          const curlX = dFz_dy.sub(dFy_dz);
          const curlY = dFx_dz.sub(dFz_dx);
          const curlZ = dFy_dx.sub(dFx_dy);
          const curl = vec3(curlX, curlY, curlZ);

          // Add curl force to velocity (scaled by intensity and deltaTime)
          velocity.addAssign(curl.mul(turbIntensity).mul(uniforms.deltaTime));
        });

        // Attractors - apply force from each active attractor
        const attractorCount = uniforms.attractorCount;

        // Helper function to apply a single attractor's force
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyAttractor = (aPos: any, aStrength: any, aRadius: any, aType: any, aAxis: any) => {
          If(aStrength.abs().greaterThan(0.001), () => {
            // Vector from particle to attractor
            const toAttractor = aPos.sub(position);
            const dist = toAttractor.length();

            // Avoid division by zero
            const safeDist = dist.max(0.01);
            const direction = toAttractor.div(safeDist);

            // Calculate falloff (1 at center, 0 at radius edge)
            // If radius is 0, no falloff (infinite range with inverse square)
            const falloff = aRadius.greaterThan(0.001).select(
              float(1).sub(dist.div(aRadius)).max(0), // Linear falloff within radius
              float(1).div(safeDist.mul(safeDist).add(1)) // Inverse square falloff (softened)
            );

            // Type 0: Point attractor - pull toward position
            // Type 1: Vortex - swirl around axis
            const force = aType.lessThan(0.5).select(
              // Point attractor: force along direction to attractor
              direction.mul(aStrength).mul(falloff),
              // Vortex: force perpendicular to both (toAttractor) and (axis)
              // cross(axis, toAttractor) gives tangent direction
              (() => {
                const tangent = vec3(
                  aAxis.y.mul(toAttractor.z).sub(aAxis.z.mul(toAttractor.y)),
                  aAxis.z.mul(toAttractor.x).sub(aAxis.x.mul(toAttractor.z)),
                  aAxis.x.mul(toAttractor.y).sub(aAxis.y.mul(toAttractor.x))
                );
                const tangentLen = tangent.length().max(0.001);
                return tangent.div(tangentLen).mul(aStrength).mul(falloff);
              })()
            );

            velocity.addAssign(force.mul(uniforms.deltaTime));
          });
        };

        // Apply each attractor (unrolled for shader compatibility)
        If(attractorCount.greaterThan(0), () => {
          applyAttractor(
            uniforms.attractor0Pos,
            uniforms.attractor0Strength,
            uniforms.attractor0Radius,
            uniforms.attractor0Type,
            uniforms.attractor0Axis
          );
        });
        If(attractorCount.greaterThan(1), () => {
          applyAttractor(
            uniforms.attractor1Pos,
            uniforms.attractor1Strength,
            uniforms.attractor1Radius,
            uniforms.attractor1Type,
            uniforms.attractor1Axis
          );
        });
        If(attractorCount.greaterThan(2), () => {
          applyAttractor(
            uniforms.attractor2Pos,
            uniforms.attractor2Strength,
            uniforms.attractor2Radius,
            uniforms.attractor2Type,
            uniforms.attractor2Axis
          );
        });
        If(attractorCount.greaterThan(3), () => {
          applyAttractor(
            uniforms.attractor3Pos,
            uniforms.attractor3Strength,
            uniforms.attractor3Radius,
            uniforms.attractor3Type,
            uniforms.attractor3Axis
          );
        });

        // Apply velocity to position, scaled by speedScale (friction/curve)
        position.addAssign(velocity.mul(dt).mul(speedScale));

        // Plane collision detection
        If(uniforms.collisionEnabled.greaterThan(0.5), () => {
          const planeY = uniforms.collisionPlaneY;
          const bounce = uniforms.collisionBounce;
          const friction = uniforms.collisionFriction;
          const shouldDie = uniforms.collisionDie;

          // Check if particle is below the plane
          If(position.y.lessThan(planeY), () => {
            If(shouldDie.greaterThan(0.5), () => {
              // Kill the particle
              lifetime.assign(float(0));
              position.y.assign(float(-1000));
            }).Else(() => {
              // Bounce the particle
              // Move particle back above the plane
              position.y.assign(planeY);

              // Reflect Y velocity and apply bounce factor
              velocity.y.assign(velocity.y.abs().mul(bounce));

              // Apply friction to horizontal velocity
              velocity.x.mulAssign(friction);
              velocity.z.mulAssign(friction);
            });
          });
        });

        // Calculate rotation speed per-particle using hash (consistent per particle)
        const idx = float(instanceIndex);
        const rotSpeedX = mix(
          uniforms.rotationSpeedMinX,
          uniforms.rotationSpeedMaxX,
          hash(idx.add(8888))
        );
        const rotSpeedY = mix(
          uniforms.rotationSpeedMinY,
          uniforms.rotationSpeedMaxY,
          hash(idx.add(9999))
        );
        const rotSpeedZ = mix(
          uniforms.rotationSpeedMinZ,
          uniforms.rotationSpeedMaxZ,
          hash(idx.add(10101))
        );

        // Sample rotation speed curve from A channel (R=size, G=opacity, B=velocity, A=rotSpeed)
        const rotSpeedCurveSample = texture(
          curveTexture,
          vec2(progress, float(0.5))
        ).w;
        const rotSpeedMultiplier = uniforms.rotationSpeedCurveEnabled
          .greaterThan(0.5)
          .select(rotSpeedCurveSample, float(1));

        // Apply rotation speed (radians/second * deltaTime * curve multiplier)
        particleRotation.addAssign(
          vec3(rotSpeedX, rotSpeedY, rotSpeedZ)
            .mul(uniforms.deltaTime)
            .mul(rotSpeedMultiplier)
        );

        // fadeRate is per-second, multiply by actual deltaTime
        lifetime.subAssign(fadeRate.mul(uniforms.deltaTime));

        If(lifetime.lessThanEqual(0), () => {
          lifetime.assign(float(0));
          position.y.assign(float(-1000));
        });
      });
    })().compute(activeMaxParticles);
  }, [
    activeMaxParticles,
    positions,
    velocities,
    lifetimes,
    fadeRates,
    particleSizes,
    particleRotations,
    uniforms,
    curveTexture,
  ]);

  // Material (either Sprite or Mesh material based on geometry prop)
  const material = useMemo(() => {
    const lifetime = lifetimes.element(instanceIndex);
    const particleSize = particleSizes.element(instanceIndex);
    const particleRotation = particleRotations.element(instanceIndex);
    const pColorStart = particleColorStarts.element(instanceIndex);
    const pColorEnd = particleColorEnds.element(instanceIndex);
    const particlePos = positions.element(instanceIndex);
    const particleVel = velocities.element(instanceIndex);

    const progress = float(1).sub(lifetime);

    const currentColor = mix(pColorStart, pColorEnd, progress);
    const intensifiedColor = currentColor.mul(uniforms.intensity);

    // Sample combined curve texture (R=size, G=opacity, B=velocity, A=rotSpeed)
    // Each channel contains the DIRECT value at the given progress (not an interpolation factor)
    // Curve Y-value IS the actual multiplier: 0=none, 1=full
    const curveSample = texture(curveTexture, vec2(progress, float(0.5)));

    // Size multiplier: use curve if enabled, otherwise interpolate fadeSize prop
    const sizeMultiplier = uniforms.fadeSizeCurveEnabled
      .greaterThan(0.5)
      .select(
        curveSample.x, // R channel - size curve value
        mix(uniforms.fadeSizeStart, uniforms.fadeSizeEnd, progress) // Linear interpolation of fadeSize
      );

    // Opacity multiplier: use curve if enabled, otherwise interpolate fadeOpacity prop
    const opacityMultiplier = uniforms.fadeOpacityCurveEnabled
      .greaterThan(0.5)
      .select(
        curveSample.y, // G channel - opacity curve value
        mix(uniforms.fadeOpacityStart, uniforms.fadeOpacityEnd, progress) // Linear interpolation of fadeOpacity
      );
    // B channel (velocity) is used in compute shader

    // Calculate UV - with flipbook support
    let sampleUV = uv();

    if (flipbook && alphaMap) {
      const rows = float(flipbook.rows || 1);
      const columns = float(flipbook.columns || 1);
      const totalFrames = rows.mul(columns);

      // Frame index based on lifetime progress (0 at birth → totalFrames-1 at death)
      const frameIndex = floor(
        progress.mul(totalFrames).min(totalFrames.sub(1))
      );

      // Calculate column and row
      const col = mod(frameIndex, columns);
      const row = floor(frameIndex.div(columns));

      // Scale UV to single frame size
      const scaledUV = uv().div(vec2(columns, rows));

      // Offset UV to correct frame (flip Y so row 0 is top)
      const offsetX = col.div(columns);
      const offsetY = rows.sub(1).sub(row).div(rows);

      // @ts-expect-error - TSL node type mismatch
      sampleUV = scaledUV.add(vec2(offsetX, offsetY));
    }

    let shapeMask;

    if (activeGeometry) {
      // For custom geometry, don't apply UV-based shape masking
      shapeMask = float(1);
    } else if (alphaMap) {
      const alphaSample = texture(alphaMap, sampleUV);
      shapeMask = alphaSample.r;
    } else {
      const dist = uv().mul(2).sub(1).length();
      switch (activeAppearance) {
        case Appearance.DEFAULT:
          shapeMask = float(1);
          break;
        case Appearance.CIRCULAR:
          shapeMask = step(dist, float(1));
          break;
        case Appearance.GRADIENT:
        default:
          shapeMask = float(1).sub(dist).max(0);
          break;
      }
    }

    const baseOpacity = opacityMultiplier
      .mul(shapeMask)
      .mul(lifetime.greaterThan(0.001).select(float(1), float(0)));

    // Particle data object for function-based nodes
    const particleData = {
      progress, // 0→1 over lifetime
      lifetime, // 1→0 over lifetime (inverse of progress)
      position: particlePos, // vec3 world position
      velocity: particleVel, // vec3 velocity
      size: particleSize, // float size
      rotation: particleRotation, // vec3 rotation (x, y, z)
      colorStart: pColorStart, // vec3 start color
      colorEnd: pColorEnd, // vec3 end color
      color: currentColor, // vec3 interpolated color
      intensifiedColor, // vec3 color * intensity
      shapeMask, // float shape/alpha mask
      index: instanceIndex, // particle index (for randomization)
    };

    // Apply custom opacity node if provided (multiplies with base opacity)
    let finalOpacity = opacityNode
      ? baseOpacity.mul(
          typeof opacityNode === 'function'
            ? opacityNode(particleData)
            : opacityNode
        )
      : baseOpacity;

    // Soft particles - fade when near scene geometry
    if (softParticles) {
      // Get scene depth from depth buffer at current screen position
      const sceneDepth = viewportDepthTexture(screenUV).x;

      // Get particle fragment depth (linearized)
      // positionView.z is negative (looking down -Z), so negate it
      const particleViewZ = positionView.z.negate();

      // Linearize scene depth (from NDC to view space)
      // depth = (2.0 * near * far) / (far + near - sceneDepth * (far - near))
      const near = cameraNear;
      const far = cameraFar;
      const sceneViewZ = near
        .mul(far)
        .mul(2)
        .div(far.add(near).sub(sceneDepth.mul(2).sub(1).mul(far.sub(near))));

      // Calculate depth difference
      const depthDiff = sceneViewZ.sub(particleViewZ);

      // Fade factor: 0 when touching surface, 1 when at softDistance or further
      const softFade = clamp(depthDiff.div(uniforms.softDistance), 0, 1);

      // Apply soft fade to opacity
      finalOpacity = finalOpacity.mul(softFade);
    }

    if (activeGeometry) {
      // InstancedMesh mode with custom geometry
      // Select material type based on lighting prop
      let mat;
      switch (activeLighting) {
        case Lighting.BASIC:
          mat = new THREE.MeshBasicNodeMaterial();
          break;
        case Lighting.PHYSICAL:
          mat = new THREE.MeshPhysicalNodeMaterial();
          break;
        case Lighting.STANDARD:
        default:
          mat = new THREE.MeshStandardNodeMaterial();
          break;
      }

      // Calculate effective velocity for stretch (uses velocity curve if enabled)
      // B channel of curveTexture contains velocity curve value
      const velocityCurveValue = curveSample.z;
      const effectiveVelocityMultiplier = uniforms.velocityCurveEnabled
        .greaterThan(0.5)
        .select(velocityCurveValue, float(1));
      const effectiveSpeed = particleVel
        .length()
        .mul(effectiveVelocityMultiplier);

      // Calculate stretch factor based on effective speed
      // stretchAmount: 1.0 = no stretch, higher = more elongated
      const stretchAmount = uniforms.stretchEnabled
        .greaterThan(0.5)
        .select(
          float(1)
            .add(effectiveSpeed.mul(uniforms.stretchFactor))
            .min(uniforms.stretchMax),
          float(1)
        );

      // Base scale
      const baseScale = particleSize.mul(sizeMultiplier);

      // Axis type: 0=+X, 1=+Y, 2=+Z, 3=-X, 4=-Y, 5=-Z
      const axisType = uniforms.orientAxisType;

      // Get axis sign (1 for +, -1 for -)
      const axisSign = axisType.lessThan(3).select(float(1), float(-1));

      // Get axis index (0=X, 1=Y, 2=Z)
      const axisIndex = axisType.mod(3);

      // Apply stretch along the chosen LOCAL axis BEFORE rotation
      // Scale the chosen axis by stretchAmount
      const stretchedLocal = uniforms.stretchEnabled.greaterThan(0.5).select(
        axisIndex.lessThan(0.5).select(
          // X axis stretch
          vec3(
            positionLocal.x.mul(stretchAmount),
            positionLocal.y,
            positionLocal.z
          ),
          axisIndex.lessThan(1.5).select(
            // Y axis stretch
            vec3(
              positionLocal.x,
              positionLocal.y.mul(stretchAmount),
              positionLocal.z
            ),
            // Z axis stretch
            vec3(
              positionLocal.x,
              positionLocal.y,
              positionLocal.z.mul(stretchAmount)
            )
          )
        ),
        positionLocal
      );

      let rotatedPos;

      if (activeOrientToDirection) {
        // Calculate velocity direction
        const velLen = particleVel.length().max(0.0001);
        const velDir = particleVel.div(velLen).mul(axisSign);

        // Get the local axis we want to align with velocity
        // axisIndex: 0=X, 1=Y, 2=Z
        const localAxis = axisIndex.lessThan(0.5).select(
          vec3(1, 0, 0), // X axis
          axisIndex.lessThan(1.5).select(
            vec3(0, 1, 0), // Y axis
            vec3(0, 0, 1) // Z axis
          )
        );

        // Rodrigues' rotation formula to rotate localAxis to velDir
        // rotation axis = cross(localAxis, velDir)
        // rotation angle = acos(dot(localAxis, velDir))

        const dotProduct = localAxis.dot(velDir).clamp(-1, 1);
        const crossProduct = localAxis.cross(velDir);
        const crossLen = crossProduct.length();

        // Handle near-parallel cases (vectors already aligned or opposite)
        const needsRotation = crossLen.greaterThan(0.0001);

        // Normalized rotation axis
        const rotAxis = needsRotation.select(
          crossProduct.div(crossLen),
          vec3(0, 1, 0) // Fallback axis (won't be used if no rotation needed)
        );

        // Rodrigues' formula: v_rot = v*cos(θ) + (k×v)*sin(θ) + k*(k·v)*(1-cos(θ))
        // where k is rotation axis, θ is angle, v is the point to rotate
        const cosAngle = dotProduct;
        const sinAngle = crossLen; // sin(acos(dot)) = |cross|
        const oneMinusCos = float(1).sub(cosAngle);

        // Apply rotation to the stretched position
        const v = stretchedLocal;
        const kDotV = rotAxis.dot(v);
        const kCrossV = rotAxis.cross(v);

        // Rodrigues' formula applied
        const rotatedByAxis = needsRotation.select(
          v
            .mul(cosAngle)
            .add(kCrossV.mul(sinAngle))
            .add(rotAxis.mul(kDotV.mul(oneMinusCos))),
          // If vectors are nearly aligned, check if they're opposite (dot ≈ -1)
          dotProduct.lessThan(-0.99).select(
            v.negate(), // Flip 180° - just negate
            v // Already aligned, no rotation
          )
        );

        rotatedPos = rotatedByAxis;
      } else {
        // Use stored particle rotation (Euler angles)
        const rotX = particleRotation.x;
        const rotY = particleRotation.y;
        const rotZ = particleRotation.z;

        // Rotation around X axis
        const cX = cos(rotX);
        const sX = sin(rotX);
        const afterX = vec3(
          stretchedLocal.x,
          stretchedLocal.y.mul(cX).sub(stretchedLocal.z.mul(sX)),
          stretchedLocal.y.mul(sX).add(stretchedLocal.z.mul(cX))
        );

        // Rotation around Y axis
        const cY = cos(rotY);
        const sY = sin(rotY);
        const afterY = vec3(
          afterX.x.mul(cY).add(afterX.z.mul(sY)),
          afterX.y,
          afterX.z.mul(cY).sub(afterX.x.mul(sY))
        );

        // Rotation around Z axis
        const cZ = cos(rotZ);
        const sZ = sin(rotZ);
        rotatedPos = vec3(
          afterY.x.mul(cZ).sub(afterY.y.mul(sZ)),
          afterY.x.mul(sZ).add(afterY.y.mul(cZ)),
          afterY.z
        );
      }

      // Apply base scale
      const scaledPos = rotatedPos.mul(baseScale);

      mat.positionNode = scaledPos.add(particlePos);

      // Apply custom colorNode if provided, otherwise use default
      const defaultColor = vec4(intensifiedColor, finalOpacity);
      mat.colorNode = colorNode
        ? typeof colorNode === 'function'
          ? colorNode(particleData, defaultColor)
          : colorNode
        : defaultColor;

      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = blending;
      mat.side = THREE.DoubleSide;

      // Apply custom backdrop node if provided (for advanced effects like refraction)
      // Supports both direct TSL node OR function that receives particle data
      if (backdropNode) {
        mat.backdropNode =
          typeof backdropNode === 'function'
            ? backdropNode(particleData)
            : backdropNode;
      }

      // Apply custom cast shadow node if provided (controls shadow map output)
      if (castShadowNode) {
        mat.castShadowNode =
          typeof castShadowNode === 'function'
            ? castShadowNode(particleData)
            : castShadowNode;
      }

      // Apply custom alpha test node if provided (for discard logic)
      if (alphaTestNode) {
        mat.alphaTestNode =
          typeof alphaTestNode === 'function'
            ? alphaTestNode(particleData)
            : alphaTestNode;
      }

      return mat;
    } else {
      // Sprite mode (default) - uses Y rotation only for 2D sprites
      const mat = new THREE.SpriteNodeMaterial();

      // Apply custom colorNode if provided, otherwise use default
      const defaultColor = vec4(intensifiedColor, finalOpacity);
      mat.colorNode = colorNode
        ? typeof colorNode === 'function'
          ? colorNode(particleData, defaultColor)
          : colorNode
        : defaultColor;

      mat.positionNode = positions.toAttribute();
      mat.scaleNode = particleSize.mul(sizeMultiplier);
      mat.rotationNode = particleRotation.y; // Use Y rotation for sprites
      mat.transparent = true;
      mat.depthWrite = false;
      mat.blending = blending;

      // Apply custom backdrop node if provided (for advanced effects like refraction)
      // Supports both direct TSL node OR function that receives particle data
      if (backdropNode) {
        mat.backdropNode =
          typeof backdropNode === 'function'
            ? backdropNode(particleData)
            : backdropNode;
      }

      // Apply custom cast shadow node if provided (controls shadow map output)
      if (castShadowNode) {
        mat.castShadowNode =
          typeof castShadowNode === 'function'
            ? castShadowNode(particleData)
            : castShadowNode;
      }

      // Apply custom alpha test node if provided (for discard logic)
      if (alphaTestNode) {
        mat.alphaTestNode =
          typeof alphaTestNode === 'function'
            ? alphaTestNode(particleData)
            : alphaTestNode;
      }

      return mat;
    }
  }, [
    positions,
    velocities,
    lifetimes,
    particleSizes,
    particleRotations,
    particleColorStarts,
    particleColorEnds,
    uniforms,
    activeAppearance,
    alphaMap,
    flipbook,
    blending,
    activeGeometry,
    activeOrientToDirection,
    activeLighting,
    backdropNode,
    opacityNode,
    colorNode,
    alphaTestNode,
    castShadowNode,
    softParticles,
    curveTexture,
  ]);

  // Create sprite or instanced mesh based on geometry prop
  const renderObject = useMemo(() => {
    if (activeGeometry) {
      // InstancedMesh mode
      const mesh = new THREE.InstancedMesh(
        activeGeometry,
        material,
        activeMaxParticles
      );
      mesh.frustumCulled = false;
      mesh.castShadow = activeShadow;
      mesh.receiveShadow = activeShadow;
      return mesh;
    } else {
      // Sprite mode (default)
      // @ts-expect-error - WebGPU SpriteNodeMaterial type mismatch
      const s = new THREE.Sprite(material);
      s.count = activeMaxParticles;
      s.frustumCulled = false;
      return s;
    }
  }, [material, activeMaxParticles, activeGeometry, activeShadow]);

  // Initialize on mount
  useEffect(() => {
    if (!renderer || initialized.current) return;
    // @ts-expect-error - WebGPU computeAsync not in WebGL types
    renderer.computeAsync(computeInit).then(() => {
      initialized.current = true;
    });
  }, [renderer, computeInit]);

  // Apply spawn overrides to uniforms, returns restore function
  const applySpawnOverrides = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (overrides: Record<string, any> | null) => {
      if (!overrides) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved: Record<string, any> = {};

      // Helper to save and set uniform value
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setUniform = (key: string, value: any) => {
        // @ts-expect-error - Dynamic uniform access
        if (uniforms[key]) {
          // @ts-expect-error - Dynamic uniform access
          saved[key] = uniforms[key].value;
          // @ts-expect-error - Dynamic uniform access
          uniforms[key].value = value;
        }
      };

      // Size: number or [min, max]
      if (overrides.size !== undefined) {
        const range = toRange(overrides.size, [0.1, 0.3]);
        setUniform('sizeMin', range[0]);
        setUniform('sizeMax', range[1]);
      }

      // Speed: number or [min, max]
      if (overrides.speed !== undefined) {
        const range = toRange(overrides.speed, [0.1, 0.1]);
        setUniform('speedMin', range[0]);
        setUniform('speedMax', range[1]);
      }

      // Lifetime: number or [min, max]
      if (overrides.lifetime !== undefined) {
        const range = toRange(overrides.lifetime, [1, 2]);
        setUniform('lifetimeMin', 1 / range[1]);
        setUniform('lifetimeMax', 1 / range[0]);
      }

      // Direction: [[minX, maxX], [minY, maxY], [minZ, maxZ]] or [min, max] or number
      if (overrides.direction !== undefined) {
        const dir3D = toRotation3D(overrides.direction);
        setUniform('dirMinX', dir3D[0][0]);
        setUniform('dirMaxX', dir3D[0][1]);
        setUniform('dirMinY', dir3D[1][0]);
        setUniform('dirMaxY', dir3D[1][1]);
        setUniform('dirMinZ', dir3D[2][0]);
        setUniform('dirMaxZ', dir3D[2][1]);
      }

      // Start position offset
      if (overrides.startPosition !== undefined) {
        const pos3D = toRotation3D(overrides.startPosition);
        setUniform('startPosMinX', pos3D[0][0]);
        setUniform('startPosMaxX', pos3D[0][1]);
        setUniform('startPosMinY', pos3D[1][0]);
        setUniform('startPosMaxY', pos3D[1][1]);
        setUniform('startPosMinZ', pos3D[2][0]);
        setUniform('startPosMaxZ', pos3D[2][1]);
      }

      // Gravity: [x, y, z]
      if (overrides.gravity !== undefined) {
        saved.gravity = uniforms.gravity.value.clone();
        uniforms.gravity.value.set(...(overrides.gravity as [number, number, number]));
      }

      // Colors - requires converting hex to RGB and setting multiple uniforms
      // @ts-expect-error - Dynamic uniform access
      const u = uniforms as Record<string, { value: THREE.Color }>;
      if (overrides.colorStart !== undefined) {
        const colors = overrides.colorStart.slice(0, 8).map(hexToRgb);
        while (colors.length < 8)
          colors.push(colors[colors.length - 1] || [1, 1, 1]);
        setUniform('colorStartCount', overrides.colorStart.length);
        colors.forEach((c: [number, number, number], i: number) => {
          if (u[`colorStart${i}`]) {
            saved[`colorStart${i}`] = u[`colorStart${i}`].value.clone();
            u[`colorStart${i}`].value.setRGB(...c);
          }
        });
      }

      if (overrides.colorEnd !== undefined) {
        const colors = overrides.colorEnd.slice(0, 8).map(hexToRgb);
        while (colors.length < 8)
          colors.push(colors[colors.length - 1] || [1, 1, 1]);
        setUniform('colorEndCount', overrides.colorEnd.length);
        colors.forEach((c: [number, number, number], i: number) => {
          if (u[`colorEnd${i}`]) {
            saved[`colorEnd${i}`] = u[`colorEnd${i}`].value.clone();
            u[`colorEnd${i}`].value.setRGB(...c);
          }
        });
      }

      // Rotation
      if (overrides.rotation !== undefined) {
        const rot3D = toRotation3D(overrides.rotation);
        setUniform('rotationMinX', rot3D[0][0]);
        setUniform('rotationMaxX', rot3D[0][1]);
        setUniform('rotationMinY', rot3D[1][0]);
        setUniform('rotationMaxY', rot3D[1][1]);
        setUniform('rotationMinZ', rot3D[2][0]);
        setUniform('rotationMaxZ', rot3D[2][1]);
      }

      // Return restore function
      return () => {
        Object.entries(saved).forEach(([key, value]) => {
          // @ts-expect-error - Dynamic uniform access
          if (uniforms[key]) {
            // @ts-expect-error - Dynamic uniform access
            uniforms[key].value = value;
          }
        });
      };
    },
    [uniforms]
  );

  // Spawn function - internal
  const spawnInternal = useCallback(
    (x: number, y: number, z: number, count = 20, overrides: Record<string, unknown> | null = null) => {
      if (!initialized.current || !renderer) return;

      // Apply overrides and get restore function
      const restore = applySpawnOverrides(overrides);

      const startIdx = nextIndex.current;
      const endIdx = (startIdx + count) % activeMaxParticles;

      uniforms.spawnPosition.value.set(x, y, z);
      uniforms.spawnIndexStart.value = startIdx;
      uniforms.spawnIndexEnd.value = endIdx;
      uniforms.spawnSeed.value = Math.random() * 10000;

      nextIndex.current = endIdx;

      // Run compute - GPU reads uniforms when dispatched, so restore immediately
      // This prevents race conditions when multiple emitters spawn in the same frame
      // @ts-expect-error - WebGPU computeAsync not in WebGL types
      renderer.computeAsync(computeSpawn);

      // Restore original values synchronously after dispatch
      if (restore) restore();
    },
    [renderer, computeSpawn, uniforms, activeMaxParticles, applySpawnOverrides]
  );

  // Public spawn - uses position prop as offset, supports overrides
  // spawn(x, y, z, count, { colorStart: [...], direction: [...], ... })
  const spawn = useCallback(
    (x = 0, y = 0, z = 0, count = 20, overrides: Record<string, unknown> | null = null) => {
      const [px, py, pz] = positionRef.current ?? [0, 0, 0];
      spawnInternal(px + x, py + y, pz + z, count, overrides);
    },
    [spawnInternal]
  );

  // Keep computeUpdate in a ref so useFrame always has the latest version
  const computeUpdateRef = useRef(computeUpdate);
  useEffect(() => {
    computeUpdateRef.current = computeUpdate;
  }, [computeUpdate]);

  // Update each frame + auto emit
  useFrame(async (state, delta) => {
    if (!initialized.current || !renderer) return;

    // Update deltaTime uniform for framerate independence
    uniforms.deltaTime.value = delta;

    // Update turbulence time (animated noise field)
    const turbSpeed = turbulenceRef.current?.speed ?? 1;
    uniforms.turbulenceTime.value += delta * turbSpeed;

    // Update particles - use ref to always get latest computeUpdate
    // @ts-expect-error - WebGPU computeAsync not in WebGL types
    await renderer.computeAsync(computeUpdateRef.current);

    // Auto emit if enabled
    if (emitting) {
      const [px, py, pz] = positionRef.current;
      const currentDelay = delayRef.current;
      const currentEmitCount = emitCountRef.current;

      if (!currentDelay) {
        // delay = 0 or undefined → emit every frame
        spawnInternal(px, py, pz, currentEmitCount);
      } else {
        // delay > 0 → emit every X seconds
        emitAccumulator.current += delta;

        if (emitAccumulator.current >= currentDelay) {
          emitAccumulator.current -= currentDelay;
          spawnInternal(px, py, pz, currentEmitCount);
        }
      }
    }
  });

  // Start/stop functions
  const start = useCallback(() => {
    setEmitting(true);
    emitAccumulator.current = 0;
  }, []);

  const stop = useCallback(() => {
    setEmitting(false);
  }, []);

  // Cleanup old material/renderObject when they change (not on unmount)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevMaterialRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevRenderObjectRef = useRef<any>(null);

  useEffect(() => {
    // Dispose previous material if it changed
    if (prevMaterialRef.current && prevMaterialRef.current !== material) {
      prevMaterialRef.current.dispose();
    }
    prevMaterialRef.current = material;

    // Dispose previous renderObject if it changed
    if (
      prevRenderObjectRef.current &&
      prevRenderObjectRef.current !== renderObject
    ) {
      if (prevRenderObjectRef.current.material) {
        prevRenderObjectRef.current.material.dispose();
      }
    }
    prevRenderObjectRef.current = renderObject;
  }, [material, renderObject]);

  // Cleanup on actual unmount only
  useEffect(() => {
    return () => {
      // Dispose material
      if (material) {
        material.dispose();
      }

      // Dispose render object
      if (renderObject) {
        if (renderObject.geometry && !geometry) {
          renderObject.geometry.dispose();
        }
        if (renderObject.material) {
          renderObject.material.dispose();
        }
      }

      // Reset initialization state only on unmount
      initialized.current = false;
      nextIndex.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose methods via ref
  // Create the API object that will be exposed via ref and registered with store
  const particleAPI = useMemo(
    () => ({
      spawn,
      start,
      stop,
      get isEmitting() {
        return emitting;
      },
      clear() {
        // @ts-expect-error WebGPU renderer method
        renderer.computeAsync(computeInit);
        nextIndex.current = 0;
      },
      uniforms,
    }),
    [spawn, start, stop, emitting, renderer, computeInit, uniforms]
  );

  useImperativeHandle(ref, () => particleAPI, [particleAPI]);

  // Register with VFX store when name prop is provided
  const registerParticles = useVFXStore((s) => s.registerParticles);
  const unregisterParticles = useVFXStore((s) => s.unregisterParticles);

  useEffect(() => {
    if (!name) return;

    // Register this particle system with the store
    registerParticles(name, particleAPI);

    return () => {
      // Unregister on unmount or name change
      unregisterParticles(name);
    };
  }, [name, particleAPI, registerParticles, unregisterParticles]);

  // Debug panel - no React state, direct ref mutation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debugValuesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevGeometryTypeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevGeometryArgsRef = useRef<any>(null);

  // Imperative update function called by debug panel
  const handleDebugUpdate = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newValues: any) => {
      // Merge new values into existing (dirty tracking only sends changed keys)
      debugValuesRef.current = { ...debugValuesRef.current, ...newValues };

      // Size
      if ('size' in newValues) {
        const sizeR = toRange(newValues.size, [0.1, 0.3]);
        uniforms.sizeMin.value = sizeR[0];
        uniforms.sizeMax.value = sizeR[1];
      }

      // Fade Size
      if ('fadeSize' in newValues) {
        const fadeSizeR = toRange(newValues.fadeSize, [1, 0]);
        uniforms.fadeSizeStart.value = fadeSizeR[0];
        uniforms.fadeSizeEnd.value = fadeSizeR[1];
      }

      // Fade Opacity
      if ('fadeOpacity' in newValues) {
        const fadeOpacityR = toRange(newValues.fadeOpacity, [1, 0]);
        uniforms.fadeOpacityStart.value = fadeOpacityR[0];
        uniforms.fadeOpacityEnd.value = fadeOpacityR[1];
      }

      // Curves - update state to trigger texture regeneration
      // Only set if the key exists (to allow clearing curves by setting to null)
      if ('fadeSizeCurve' in newValues) {
        setActiveFadeSizeCurve(newValues.fadeSizeCurve);
        // Update fade size curve enabled uniform
        uniforms.fadeSizeCurveEnabled.value = newValues.fadeSizeCurve ? 1 : 0;
      }
      if ('fadeOpacityCurve' in newValues) {
        setActiveFadeOpacityCurve(newValues.fadeOpacityCurve);
        // Update fade opacity curve enabled uniform
        uniforms.fadeOpacityCurveEnabled.value = newValues.fadeOpacityCurve
          ? 1
          : 0;
      }
      if ('velocityCurve' in newValues) {
        setActiveVelocityCurve(newValues.velocityCurve);
        // Update velocity curve enabled uniform
        uniforms.velocityCurveEnabled.value = newValues.velocityCurve ? 1 : 0;
      }
      if ('rotationSpeedCurve' in newValues) {
        setActiveRotationSpeedCurve(newValues.rotationSpeedCurve);
        // Update rotation speed curve enabled uniform
        uniforms.rotationSpeedCurveEnabled.value = newValues.rotationSpeedCurve
          ? 1
          : 0;
      }

      // Orient axis
      if ('orientAxis' in newValues) {
        uniforms.orientAxisType.value = axisToNumber(newValues.orientAxis);
      }

      // Stretch by speed
      if ('stretchBySpeed' in newValues) {
        uniforms.stretchEnabled.value = newValues.stretchBySpeed ? 1 : 0;
        uniforms.stretchFactor.value = newValues.stretchBySpeed?.factor ?? 1;
        uniforms.stretchMax.value = newValues.stretchBySpeed?.maxStretch ?? 5;
      }

      // Physics - update gravity Vector3 components directly
      if (newValues.gravity && Array.isArray(newValues.gravity)) {
        uniforms.gravity.value.x = newValues.gravity[0];
        uniforms.gravity.value.y = newValues.gravity[1];
        uniforms.gravity.value.z = newValues.gravity[2];
      }

      // Speed
      if ('speed' in newValues) {
        const speedR = toRange(newValues.speed, [0.1, 0.1]);
        uniforms.speedMin.value = speedR[0];
        uniforms.speedMax.value = speedR[1];
      }

      // Lifetime
      if ('lifetime' in newValues) {
        const lifetimeR = toRange(newValues.lifetime, [1, 2]);
        uniforms.lifetimeMin.value = 1 / lifetimeR[1];
        uniforms.lifetimeMax.value = 1 / lifetimeR[0];
      }

      // Friction
      if ('friction' in newValues && newValues.friction) {
        const frictionR = toRange(newValues.friction.intensity, [0, 0]);
        uniforms.frictionIntensityStart.value = frictionR[0];
        uniforms.frictionIntensityEnd.value = frictionR[1];
        uniforms.frictionEasingType.value = easingToType(
          newValues.friction.easing
        );
      }

      // Direction 3D
      if ('direction' in newValues) {
        const dir3D = toRotation3D(newValues.direction);
        uniforms.dirMinX.value = dir3D[0][0];
        uniforms.dirMaxX.value = dir3D[0][1];
        uniforms.dirMinY.value = dir3D[1][0];
        uniforms.dirMaxY.value = dir3D[1][1];
        uniforms.dirMinZ.value = dir3D[2][0];
        uniforms.dirMaxZ.value = dir3D[2][1];
      }

      // Start position 3D
      if ('startPosition' in newValues) {
        const startPos3D = toRotation3D(newValues.startPosition);
        uniforms.startPosMinX.value = startPos3D[0][0];
        uniforms.startPosMaxX.value = startPos3D[0][1];
        uniforms.startPosMinY.value = startPos3D[1][0];
        uniforms.startPosMaxY.value = startPos3D[1][1];
        uniforms.startPosMinZ.value = startPos3D[2][0];
        uniforms.startPosMaxZ.value = startPos3D[2][1];
      }

      // Rotation 3D
      if ('rotation' in newValues) {
        const rot3D = toRotation3D(newValues.rotation);
        uniforms.rotationMinX.value = rot3D[0][0];
        uniforms.rotationMaxX.value = rot3D[0][1];
        uniforms.rotationMinY.value = rot3D[1][0];
        uniforms.rotationMaxY.value = rot3D[1][1];
        uniforms.rotationMinZ.value = rot3D[2][0];
        uniforms.rotationMaxZ.value = rot3D[2][1];
      }

      // Rotation speed 3D
      if ('rotationSpeed' in newValues) {
        const rotSpeed3D = toRotation3D(newValues.rotationSpeed);
        uniforms.rotationSpeedMinX.value = rotSpeed3D[0][0];
        uniforms.rotationSpeedMaxX.value = rotSpeed3D[0][1];
        uniforms.rotationSpeedMinY.value = rotSpeed3D[1][0];
        uniforms.rotationSpeedMaxY.value = rotSpeed3D[1][1];
        uniforms.rotationSpeedMinZ.value = rotSpeed3D[2][0];
        uniforms.rotationSpeedMaxZ.value = rotSpeed3D[2][1];
      }

      // Intensity
      if ('intensity' in newValues) {
        uniforms.intensity.value = newValues.intensity || 1;
      }

      // Colors
      if ('colorStart' in newValues && newValues.colorStart) {
        const startColors = newValues.colorStart.slice(0, 8).map(hexToRgb);
        while (startColors.length < 8)
          startColors.push(startColors[startColors.length - 1] || [1, 1, 1]);
        uniforms.colorStartCount.value = newValues.colorStart.length;
        startColors.forEach((c: [number, number, number], i: number) => {
          // @ts-expect-error Dynamic uniform indexing
          if (uniforms[`colorStart${i}`]) {
            // @ts-expect-error Dynamic uniform indexing
            uniforms[`colorStart${i}`].value.setRGB(...c);
          }
        });

        // If colorEnd is disabled (null), also update colorEnd to match colorStart (no color transition)
        const currentColorEnd = debugValuesRef.current?.colorEnd;
        if (!currentColorEnd) {
          uniforms.colorEndCount.value = newValues.colorStart.length;
          startColors.forEach((c: [number, number, number], i: number) => {
            // @ts-expect-error Dynamic uniform indexing
            if (uniforms[`colorEnd${i}`]) {
              // @ts-expect-error Dynamic uniform indexing
              uniforms[`colorEnd${i}`].value.setRGB(...c);
            }
          });
        }
      }

      // Color End - if colorEnd is explicitly set (including null), handle it
      if ('colorEnd' in newValues) {
        // If colorEnd is null/falsy, use colorStart for end colors (no color transition)
        // Fall back to debugValuesRef if newValues.colorStart isn't present
        const effectiveEndColors = newValues.colorEnd ||
          newValues.colorStart ||
          debugValuesRef.current?.colorStart || ['#ffffff'];
        if (effectiveEndColors) {
          const endColors = effectiveEndColors.slice(0, 8).map(hexToRgb);
          while (endColors.length < 8)
            endColors.push(endColors[endColors.length - 1] || [1, 1, 1]);
          uniforms.colorEndCount.value = effectiveEndColors.length;
          endColors.forEach((c: [number, number, number], i: number) => {
            // @ts-expect-error Dynamic uniform indexing
            if (uniforms[`colorEnd${i}`]) {
              // @ts-expect-error Dynamic uniform indexing
              uniforms[`colorEnd${i}`].value.setRGB(...c);
            }
          });
        }
      }

      // Emitter shape
      if ('emitterShape' in newValues) {
        uniforms.emitterShapeType.value =
          newValues.emitterShape ?? EmitterShape.BOX;
      }
      if ('emitterRadius' in newValues) {
        const emitterRadiusR = toRange(newValues.emitterRadius, [0, 1]);
        uniforms.emitterRadiusInner.value = emitterRadiusR[0];
        uniforms.emitterRadiusOuter.value = emitterRadiusR[1];
      }
      if ('emitterAngle' in newValues) {
        uniforms.emitterAngle.value = newValues.emitterAngle ?? Math.PI / 4;
      }
      if ('emitterHeight' in newValues) {
        const emitterHeightR = toRange(newValues.emitterHeight, [0, 1]);
        uniforms.emitterHeightMin.value = emitterHeightR[0];
        uniforms.emitterHeightMax.value = emitterHeightR[1];
      }
      if ('emitterSurfaceOnly' in newValues) {
        uniforms.emitterSurfaceOnly.value = newValues.emitterSurfaceOnly
          ? 1
          : 0;
      }
      if (
        'emitterDirection' in newValues &&
        newValues.emitterDirection &&
        Array.isArray(newValues.emitterDirection)
      ) {
        const dir = new THREE.Vector3(
          ...newValues.emitterDirection
        ).normalize();
        uniforms.emitterDir.value.x = dir.x;
        uniforms.emitterDir.value.y = dir.y;
        uniforms.emitterDir.value.z = dir.z;
      }

      // Turbulence
      if ('turbulence' in newValues) {
        uniforms.turbulenceIntensity.value =
          newValues.turbulence?.intensity ?? 0;
        uniforms.turbulenceFrequency.value =
          newValues.turbulence?.frequency ?? 1;
        uniforms.turbulenceSpeed.value = newValues.turbulence?.speed ?? 1;
        turbulenceRef.current = newValues.turbulence;
      }

      // Attract to center
      if ('attractToCenter' in newValues) {
        uniforms.attractToCenter.value = newValues.attractToCenter ? 1 : 0;
      }

      // Start position as direction
      if ('startPositionAsDirection' in newValues) {
        uniforms.startPositionAsDirection.value =
          newValues.startPositionAsDirection ? 1 : 0;
      }

      // Soft particles
      if ('softParticles' in newValues) {
        uniforms.softParticlesEnabled.value = newValues.softParticles ? 1 : 0;
      }
      if ('softDistance' in newValues) {
        uniforms.softDistance.value = newValues.softDistance ?? 0.5;
      }

      // Collision
      if ('collision' in newValues) {
        uniforms.collisionEnabled.value = newValues.collision ? 1 : 0;
        uniforms.collisionPlaneY.value = newValues.collision?.plane?.y ?? 0;
        uniforms.collisionBounce.value = newValues.collision?.bounce ?? 0.3;
        uniforms.collisionFriction.value = newValues.collision?.friction ?? 0.8;
        uniforms.collisionDie.value = newValues.collision?.die ? 1 : 0;
        uniforms.sizeBasedGravity.value =
          newValues.collision?.sizeBasedGravity ?? 0;
      }

      // Position ref update
      if (newValues.position) {
        positionRef.current = newValues.position;
      }

      // Runtime refs update (for values used in useFrame)
      if ('delay' in newValues) delayRef.current = newValues.delay ?? 0;
      if ('emitCount' in newValues)
        emitCountRef.current = newValues.emitCount ?? 1;
      // turbulenceRef is updated in the turbulence block above

      // Update emitting state
      if (newValues.autoStart !== undefined) {
        setEmitting(newValues.autoStart);
      }

      // Update material blending directly
      if (material && newValues.blending !== undefined) {
        material.blending = newValues.blending;
        material.needsUpdate = true;
      }

      // Remount-required values - these trigger useMemo recalculation
      if (
        newValues.maxParticles !== undefined &&
        newValues.maxParticles !== activeMaxParticles
      ) {
        setActiveMaxParticles(newValues.maxParticles);
        initialized.current = false; // Force re-init
        nextIndex.current = 0;
      }
      if (
        newValues.lighting !== undefined &&
        newValues.lighting !== activeLighting
      ) {
        setActiveLighting(newValues.lighting);
      }
      if (
        newValues.appearance !== undefined &&
        newValues.appearance !== activeAppearance
      ) {
        setActiveAppearance(newValues.appearance);
      }
      if (
        newValues.orientToDirection !== undefined &&
        newValues.orientToDirection !== activeOrientToDirection
      ) {
        setActiveOrientToDirection(newValues.orientToDirection);
      }
      if (newValues.shadow !== undefined && newValues.shadow !== activeShadow) {
        setActiveShadow(newValues.shadow);
      }

      // Handle geometry type and args changes - only recreate if those keys were actually changed
      if ('geometryType' in newValues || 'geometryArgs' in newValues) {
        const geoType = newValues.geometryType ?? prevGeometryTypeRef.current;
        const geoArgs = newValues.geometryArgs ?? prevGeometryArgsRef.current;
        const geoTypeChanged =
          'geometryType' in newValues &&
          geoType !== prevGeometryTypeRef.current;
        const geoArgsChanged =
          'geometryArgs' in newValues &&
          JSON.stringify(geoArgs) !==
            JSON.stringify(prevGeometryArgsRef.current);

        if (geoTypeChanged || geoArgsChanged) {
          prevGeometryTypeRef.current = geoType;
          prevGeometryArgsRef.current = geoArgs;

          import('./VFXParticlesDebugPanel').then(
            ({ createGeometry, GeometryType }) => {
              if (geoType === GeometryType.NONE || !geoType) {
                // Dispose old geometry if switching to sprite mode
                if (activeGeometry !== null && !geometry) {
                  activeGeometry.dispose();
                }
                setActiveGeometry(null);
              } else {
                const newGeometry = createGeometry(geoType, geoArgs);
                if (newGeometry) {
                  // Dispose old geometry if it was created by debug panel (not from props)
                  if (activeGeometry !== null && activeGeometry !== geometry) {
                    activeGeometry.dispose();
                  }
                  setActiveGeometry(newGeometry);
                }
              }
            }
          );
        }
      }
    },
    [
      uniforms,
      material,
      renderObject,
      activeMaxParticles,
      activeLighting,
      activeAppearance,
      activeOrientToDirection,
      activeShadow,
      activeGeometry,
      geometry,
    ]
  );

  // Initialize debug panel once on mount if debug is enabled
  useEffect(() => {
    if (!debug) return;

    // Initialize debug values from props
    const initialValues = {
      maxParticles,
      size,
      colorStart,
      colorEnd,
      fadeSize,
      fadeSizeCurve: fadeSizeCurve || null, // null = linear (no curve)
      fadeOpacity,
      fadeOpacityCurve: fadeOpacityCurve || null, // null = linear (no curve)
      velocityCurve: velocityCurve || null, // null = use friction (no curve)
      gravity,
      lifetime,
      direction,
      startPosition,
      startPositionAsDirection,
      speed,
      friction,
      appearance,
      rotation,
      rotationSpeed,
      rotationSpeedCurve: rotationSpeedCurve || null, // null = constant speed (no curve)
      orientToDirection,
      orientAxis,
      stretchBySpeed: stretchBySpeed || null,
      lighting,
      shadow,
      blending,
      intensity,
      position,
      autoStart,
      delay,
      emitCount,
      emitterShape,
      emitterRadius,
      emitterAngle,
      emitterHeight,
      emitterSurfaceOnly,
      emitterDirection,
      turbulence,
      attractToCenter,
      softParticles,
      softDistance,
      collision,
      // Geometry type and args - detect from passed geometry if possible
      ...detectGeometryTypeAndArgs(geometry),
    };

    // Helper to detect geometry type from THREE.js geometry object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function detectGeometryTypeAndArgs(geo: any) {
      if (!geo) return { geometryType: 'none', geometryArgs: null };

      const name = geo.constructor.name;
      const params = geo.parameters || {};

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
          };
        case 'SphereGeometry':
          return {
            geometryType: 'sphere',
            geometryArgs: {
              radius: params.radius ?? 0.5,
              widthSegments: params.widthSegments ?? 16,
              heightSegments: params.heightSegments ?? 12,
            },
          };
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
          };
        case 'ConeGeometry':
          return {
            geometryType: 'cone',
            geometryArgs: {
              radius: params.radius ?? 0.5,
              height: params.height ?? 1,
              radialSegments: params.radialSegments ?? 16,
              heightSegments: params.heightSegments ?? 1,
            },
          };
        case 'TorusGeometry':
          return {
            geometryType: 'torus',
            geometryArgs: {
              radius: params.radius ?? 0.5,
              tube: params.tube ?? 0.2,
              radialSegments: params.radialSegments ?? 12,
              tubularSegments: params.tubularSegments ?? 24,
            },
          };
        case 'PlaneGeometry':
          return {
            geometryType: 'plane',
            geometryArgs: {
              width: params.width ?? 1,
              height: params.height ?? 1,
              widthSegments: params.widthSegments ?? 1,
              heightSegments: params.heightSegments ?? 1,
            },
          };
        case 'CircleGeometry':
          return {
            geometryType: 'circle',
            geometryArgs: {
              radius: params.radius ?? 0.5,
              segments: params.segments ?? 16,
            },
          };
        case 'RingGeometry':
          return {
            geometryType: 'ring',
            geometryArgs: {
              innerRadius: params.innerRadius ?? 0.25,
              outerRadius: params.outerRadius ?? 0.5,
              thetaSegments: params.thetaSegments ?? 16,
            },
          };
        case 'DodecahedronGeometry':
          return {
            geometryType: 'dodecahedron',
            geometryArgs: {
              radius: params.radius ?? 0.5,
              detail: params.detail ?? 0,
            },
          };
        case 'IcosahedronGeometry':
          return {
            geometryType: 'icosahedron',
            geometryArgs: {
              radius: params.radius ?? 0.5,
              detail: params.detail ?? 0,
            },
          };
        case 'OctahedronGeometry':
          return {
            geometryType: 'octahedron',
            geometryArgs: {
              radius: params.radius ?? 0.5,
              detail: params.detail ?? 0,
            },
          };
        case 'TetrahedronGeometry':
          return {
            geometryType: 'tetrahedron',
            geometryArgs: {
              radius: params.radius ?? 0.5,
              detail: params.detail ?? 0,
            },
          };
        case 'CapsuleGeometry':
          return {
            geometryType: 'capsule',
            geometryArgs: {
              radius: params.radius ?? 0.25,
              length: params.length ?? 0.5,
              capSegments: params.capSegments ?? 4,
              radialSegments: params.radialSegments ?? 8,
            },
          };
        default:
          // Unknown geometry type - show as "none" but keep the geometry
          return { geometryType: 'none', geometryArgs: null };
      }
    }
    debugValuesRef.current = initialValues;
    // Initialize geometry tracking refs
    prevGeometryTypeRef.current = initialValues.geometryType;
    prevGeometryArgsRef.current = initialValues.geometryArgs;

    // Render debug panel
    import('./VFXParticlesDebugPanel').then(({ renderDebugPanel }) => {
      renderDebugPanel(initialValues, handleDebugUpdate);
    });

    return () => {
      import('./VFXParticlesDebugPanel').then(({ destroyDebugPanel }) => {
        destroyDebugPanel();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debug, geometry]);

  // Update debug panel callback when handleDebugUpdate changes (e.g., after state changes)
  useEffect(() => {
    if (!debug) return;
    import('./VFXParticlesDebugPanel').then(({ updateDebugPanel }) => {
      if (debugValuesRef.current) {
        // Pass a NEW object copy to trigger the reference check in debug panel
        updateDebugPanel({ ...debugValuesRef.current }, handleDebugUpdate);
      }
    });
  }, [debug, handleDebugUpdate]);

  // @ts-expect-error R3F primitive element
  return <primitive ref={spriteRef} object={renderObject} />;
});
