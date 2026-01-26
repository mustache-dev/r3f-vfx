# r3f-vf

High-performance GPU-accelerated particle system for Three.js WebGPU with React Three Fiber.

## Features

- 🚀 **GPU Compute Shaders** - All particle simulation runs on the GPU for maximum performance
- 🎨 **Flexible Appearance** - Sprites, custom geometry, materials, and shaders
- 🌀 **Advanced Physics** - Gravity, turbulence, attractors, collisions, and more
- 🎯 **Multiple Emitter Shapes** - Point, Box, Sphere, Cone, Disk, and Edge emitters
- 📊 **Curve-based Control** - Bezier curves for size, opacity, velocity, and rotation over lifetime
- 🔗 **Emitter System** - Decoupled emitters that can share particle systems
- ⚡ **WebGPU Native** - Built specifically for Three.js WebGPU renderer

## Installation

```bash
npm install r3f-vfx
```

### Peer Dependencies

```bash
npm install three @react-three/fiber zustand react
```

## Quick Start

```tsx
import { Canvas } from "@react-three/fiber";
import { VFXParticles, Appearance, EmitterShape } from "r3f-vfx";
import * as THREE from "three/webgpu";

function App() {
  return (
    <Canvas
      renderer
    >
      <VFXParticles debug/>
    </Canvas>
  );
}
```

That's it, start designing in the debug panel, then copy JSX 


## API Reference

### VFXParticles

The main particle system component.

#### Basic Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | - | Register system for use with VFXEmitter |
| `maxParticles` | `number` | `10000` | Maximum number of particles |
| `autoStart` | `boolean` | `true` | Start emitting automatically |
| `delay` | `number` | `0` | Seconds between emissions (0 = every frame) |
| `emitCount` | `number` | `1` | Particles to emit per burst |
| `position` | `[x, y, z]` | `[0, 0, 0]` | Emitter position |

#### Appearance Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `number \| [min, max]` | `[0.1, 0.3]` | Particle size range |
| `colorStart` | `string[]` | `["#ffffff"]` | Starting colors (random pick) |
| `colorEnd` | `string[] \| null` | `null` | Ending colors (null = no transition) |
| `fadeSize` | `number \| [start, end]` | `[1, 0]` | Size multiplier over lifetime |
| `fadeOpacity` | `number \| [start, end]` | `[1, 0]` | Opacity over lifetime |
| `appearance` | `Appearance` | `GRADIENT` | Shape: `DEFAULT`, `GRADIENT`, `CIRCULAR` |
| `intensity` | `number` | `1` | Color intensity multiplier |
| `blending` | `Blending` | `NORMAL` | Blend mode: `NORMAL`, `ADDITIVE`, `MULTIPLY`, `SUBTRACTIVE` |

#### Physics Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `lifetime` | `number \| [min, max]` | `[1, 2]` | Particle lifetime in seconds |
| `speed` | `number \| [min, max]` | `[0.1, 0.1]` | Initial speed |
| `direction` | `Range3D \| [min, max]` | `[[-1,1], [0,1], [-1,1]]` | Emission direction per axis |
| `gravity` | `[x, y, z]` | `[0, 0, 0]` | Gravity vector |
| `friction` | `FrictionConfig` | `{ intensity: 0 }` | Velocity damping |

#### Emitter Shape Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `emitterShape` | `EmitterShape` | `BOX` | Shape: `POINT`, `BOX`, `SPHERE`, `CONE`, `DISK`, `EDGE` |
| `emitterRadius` | `[inner, outer]` | `[0, 1]` | Radius range for sphere/cone/disk |
| `emitterAngle` | `number` | `π/4` | Cone angle in radians |
| `emitterHeight` | `[min, max]` | `[0, 1]` | Height range for cone |
| `emitterDirection` | `[x, y, z]` | `[0, 1, 0]` | Cone/disk normal direction |
| `emitterSurfaceOnly` | `boolean` | `false` | Emit from surface only |
| `startPosition` | `Range3D` | `[[0,0], [0,0], [0,0]]` | Position offset per axis |

#### Geometry Mode Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `geometry` | `BufferGeometry` | `null` | Custom particle geometry |
| `lighting` | `Lighting` | `STANDARD` | Material: `BASIC`, `STANDARD`, `PHYSICAL` |
| `shadow` | `boolean` | `false` | Enable shadow casting/receiving |
| `orientToDirection` | `boolean` | `false` | Orient geometry to velocity |
| `orientAxis` | `string` | `"z"` | Axis to align: `"x"`, `"y"`, `"z"`, `"-x"`, `"-y"`, `"-z"` |
| `rotation` | `Range3D \| [min, max]` | `[0, 0]` | Initial rotation per axis |
| `rotationSpeed` | `Range3D \| [min, max]` | `[0, 0]` | Rotation speed rad/s |

#### Stretch Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `stretchBySpeed` | `StretchConfig` | `null` | Stretch particles by velocity |

```ts
interface StretchConfig {
  factor: number;    // Stretch multiplier
  maxStretch: number; // Maximum stretch amount
}
```

#### Turbulence Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `turbulence` | `TurbulenceConfig` | `null` | Curl noise turbulence |

```ts
interface TurbulenceConfig {
  intensity: number;  // Turbulence strength
  frequency: number;  // Noise scale
  speed: number;      // Animation speed
}
```

#### Attractor Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `attractors` | `AttractorConfig[]` | `null` | Up to 4 attractors |
| `attractToCenter` | `boolean` | `false` | Pull particles to emitter center |

```ts
interface AttractorConfig {
  position: [x, y, z];
  strength: number;     // Positive = attract, negative = repel
  radius?: number;      // 0 = infinite range
  type?: "point" | "vortex";
  axis?: [x, y, z];     // Vortex rotation axis
}
```

#### Collision Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `collision` | `CollisionConfig` | `null` | Plane collision |

```ts
interface CollisionConfig {
  plane: { y: number };  // Plane Y position
  bounce?: number;       // Bounce factor (0-1)
  friction?: number;     // Horizontal friction
  die?: boolean;         // Kill on collision
  sizeBasedGravity?: number; // Gravity multiplier by size
}
```

#### Soft Particles Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `softParticles` | `boolean` | `false` | Fade near geometry |
| `softDistance` | `number` | `0.5` | Fade distance in world units |

#### Curve Props

All curves use Bezier spline format:

```ts
interface CurveData {
  points: Array<{
    pos: [x, y];           // Position (x: 0-1 progress, y: value)
    handleIn?: [x, y];     // Bezier handle in (offset)
    handleOut?: [x, y];    // Bezier handle out (offset)
  }>;
}
```

| Prop | Type | Description |
|------|------|-------------|
| `fadeSizeCurve` | `CurveData` | Size multiplier over lifetime |
| `fadeOpacityCurve` | `CurveData` | Opacity over lifetime |
| `velocityCurve` | `CurveData` | Velocity multiplier (overrides friction) |
| `rotationSpeedCurve` | `CurveData` | Rotation speed multiplier |

#### Custom Shader Props

| Prop | Type | Description |
|------|------|-------------|
| `colorNode` | `NodeFunction` | Custom color shader |
| `opacityNode` | `NodeFunction` | Custom opacity shader |
| `backdropNode` | `NodeFunction` | Backdrop sampling (refraction) |
| `castShadowNode` | `NodeFunction` | Shadow map output |
| `alphaTestNode` | `NodeFunction` | Alpha test/discard |

```ts
type NodeFunction = (data: ParticleData, defaultColor?: Node) => Node;

interface ParticleData {
  progress: Node;      // 0 → 1 over lifetime
  lifetime: Node;      // 1 → 0 over lifetime
  position: Node;      // vec3 world position
  velocity: Node;      // vec3 velocity
  size: Node;          // float size
  rotation: Node;      // vec3 rotation
  colorStart: Node;    // vec3 start color
  colorEnd: Node;      // vec3 end color
  color: Node;         // vec3 interpolated color
  intensifiedColor: Node; // color × intensity
  shapeMask: Node;     // float alpha mask
  index: Node;         // particle index
}
```

#### Texture Props

| Prop | Type | Description |
|------|------|-------------|
| `alphaMap` | `Texture` | Alpha/shape texture |
| `flipbook` | `FlipbookConfig` | Animated flipbook |

```ts
interface FlipbookConfig {
  rows: number;
  columns: number;
}
```

### VFXEmitter

Decoupled emitter component that links to a VFXParticles system.

```tsx
<VFXParticles name="sparks" maxParticles={1000} autoStart={false} />

<group ref={playerRef}>
  <VFXEmitter
    name="sparks"
    position={[0, 1, 0]}
    emitCount={5}
    delay={0.1}
    direction={[[0, 0], [0, 0], [-1, -1]]}
    localDirection={true}
  />
</group>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | - | Name of VFXParticles system |
| `particlesRef` | `Ref<ParticleAPI>` | - | Direct ref (alternative to name) |
| `position` | `[x, y, z]` | `[0, 0, 0]` | Local position offset |
| `emitCount` | `number` | `10` | Particles per burst |
| `delay` | `number` | `0` | Seconds between emissions |
| `autoStart` | `boolean` | `true` | Start emitting automatically |
| `loop` | `boolean` | `true` | Keep emitting (false = once) |
| `localDirection` | `boolean` | `false` | Transform direction by parent rotation |
| `direction` | `Range3D` | - | Direction override |
| `overrides` | `SpawnOverrides` | - | Per-spawn property overrides |
| `onEmit` | `function` | - | Callback after each emission |

#### Ref Methods

```ts
interface VFXEmitterAPI {
  emit(): boolean;           // Emit at current position
  burst(count?: number): boolean; // Burst emit
  start(): void;             // Start auto-emission
  stop(): void;              // Stop auto-emission
  isEmitting: boolean;       // Current state
  getParticleSystem(): ParticleAPI;
  group: THREE.Group;        // The group element
}
```

### useVFXEmitter Hook

Programmatic emitter control.

```tsx
function MyComponent() {
  const { emit, burst, start, stop } = useVFXEmitter("sparks");

  const handleClick = () => {
    burst([0, 1, 0], 100, { colorStart: ["#ff0000"] });
  };

  return <mesh onClick={handleClick}>...</mesh>;
}
```

#### Returns

```ts
interface UseVFXEmitterResult {
  emit(position?: [x,y,z], count?: number, overrides?: SpawnOverrides): boolean;
  burst(position?: [x,y,z], count?: number, overrides?: SpawnOverrides): boolean;
  start(): boolean;
  stop(): boolean;
  clear(): boolean;
  isEmitting(): boolean;
  getUniforms(): Record<string, { value: unknown }>;
  getParticles(): ParticleAPI;
}
```

### useVFXStore

Zustand store for managing particle systems.

```ts
const store = useVFXStore();

// Access registered particle systems
const sparks = store.getParticles("sparks");
sparks?.spawn(0, 0, 0, 50);

// Store methods
store.emit("sparks", { x: 0, y: 0, z: 0, count: 20 });
store.start("sparks");
store.stop("sparks");
store.clear("sparks");
```

## Examples

### Fire Effect

```tsx
<VFXParticles
  maxParticles={3000}
  size={[0.3, 0.8]}
  colorStart={["#ff6600", "#ffcc00", "#ff0000"]}
  colorEnd={["#ff0000", "#330000"]}
  fadeSize={[1, 0.2]}
  fadeOpacity={[1, 0]}
  gravity={[0, 0.5, 0]}
  lifetime={[0.4, 0.8]}
  direction={[[-0.3, 0.3], [0.5, 1], [-0.3, 0.3]]}
  speed={[0.01, 0.05]}
  friction={{ intensity: 0.03, easing: "easeOut" }}
  appearance={Appearance.GRADIENT}
  intensity={10}
/>
```

### Sphere Burst

```tsx
<VFXParticles
  maxParticles={500}
  size={[0.05, 0.1]}
  colorStart={["#00ffff", "#0088ff"]}
  fadeOpacity={[1, 0]}
  lifetime={[1, 2]}
  emitterShape={EmitterShape.SPHERE}
  emitterRadius={[0.5, 1]}
  startPositionAsDirection={true}
  speed={[0.1, 0.2]}
/>
```

### 3D Geometry Particles

```tsx
import { BoxGeometry } from "three/webgpu";

<VFXParticles
  geometry={new BoxGeometry(1, 1, 1)}
  maxParticles={500}
  size={[0.1, 0.2]}
  colorStart={["#ff00ff", "#aa00ff"]}
  gravity={[0, -2, 0]}
  lifetime={[1, 2]}
  rotation={[[0, Math.PI * 2], [0, Math.PI * 2], [0, Math.PI * 2]]}
  shadow={true}
  lighting={Lighting.STANDARD}
/>
```

### Turbulent Smoke

```tsx
<VFXParticles
  maxParticles={300}
  size={[0.3, 0.6]}
  colorStart={["#666666", "#888888"]}
  colorEnd={["#333333"]}
  fadeSize={[0.5, 1.5]}
  fadeOpacity={[0.6, 0]}
  gravity={[0, 0.5, 0]}
  lifetime={[3, 5]}
  direction={[[-0.1, 0.1], [0.3, 0.5], [-0.1, 0.1]]}
  speed={[0.02, 0.05]}
  turbulence={{
    intensity: 1.2,
    frequency: 0.8,
    speed: 0.3,
  }}
/>
```

### Velocity Curves

```tsx
<VFXParticles
  maxParticles={1000}
  velocityCurve={{
    points: [
      { pos: [0, 1], handleOut: [0.1, 0] },
      { pos: [0.5, 0.2], handleIn: [-0.1, 0], handleOut: [0.1, 0] },
      { pos: [1, 0], handleIn: [-0.1, 0] },
    ],
  }}
  speed={[0.5, 1]}
  lifetime={[2, 3]}
/>
```

## TypeScript

Full TypeScript support with exported types:

```ts
import type {
  VFXParticlesProps,
  VFXEmitterProps,
  ParticleAPI,
  SpawnOverrides,
  CurveData,
  TurbulenceConfig,
  CollisionConfig,
  AttractorConfig,
} from "r3f-vfx";
```

## License

MIT