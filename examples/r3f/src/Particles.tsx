import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { VFXParticles } from '../../../packages/r3f-vfx/src/'
import {
  TextureLoader,
  BoxGeometry,
  SphereGeometry,
  RepeatWrapping,
  LinearFilter,
  ConeGeometry,
  DodecahedronGeometry,
  Color,
  CapsuleGeometry,
  MeshBasicNodeMaterial,
  NearestFilter,
  Node,
  Texture,
  Mesh,
} from 'three/webgpu'
import { useGLTF } from '@react-three/drei'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  viewportSharedTexture,
  screenUV,
  time,
  normalView,
  positionViewDirection,
  dot,
  abs,
  pow,
  float,
  vec2,
  vec3,
  mix,
  normalGeometry,
  clamp,
  positionWorld,
  positionLocal,
  sin,
  PI,
  normalize,
  max,
  smoothstep,
  vec4,
  reflector,
  texture,
  positionView,
  uniform,
  mul,
  If,
  Discard,
  Fn,
  uv,
  atan,
  length,
  PI2,
  fract,
  normalViewGeometry,
  color,
} from 'three/tsl'
//console.log('push for vercel')
export const Particles = () => {
  // const swordParticlesRef = useRef();
  const smokeTexture = new TextureLoader().load('./2.png')
  const noiseTexture = new TextureLoader().load('./noise.png')
  const tileTexture = new TextureLoader().load('./tile-2.png')
  tileTexture.minFilter = tileTexture.magFilter = NearestFilter
  const { nodes: cherryBlossomPetalNodes } = useGLTF(
    '/cherry_blossom_petal-transformed.glb'
  )
  const cherryBlossomPetalGeometry = useMemo(() => {
    // @ts-expect-error
    const geo1 = cherryBlossomPetalNodes.Object_4.geometry
    return geo1
  }, [cherryBlossomPetalNodes])
  noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping
  noiseTexture.minFilter = noiseTexture.magFilter = LinearFilter

  // Load sword model and merge geometries
  const { nodes } = useGLTF('/sword1-transformed.glb')

  const swordGeometry = useMemo(() => {
    // @ts-expect-error
    const geo1 = nodes.Cube001.geometry
    return geo1
  }, [nodes])

  const impactRef = useRef<Mesh>(null)
  // Sphere geometry for bouncing balls
  const sphereGeometry = useMemo(() => {
    return new SphereGeometry(0.5, 16, 16)
  }, [])

  // const polarMat = useMemo(() => {
  //   const mat = new MeshBasicNodeMaterial()
  //     const fresnelPower = float(0.0);
  //    const fresnelDot = max(
  //     dot(normalize(positionViewDirection), normalize(normalView)),
  //     float(0)
  //   );
  //   const fresnel = pow(float(1).sub(fresnelDot), fresnelPower);

  //   const tile = texture(tileTexture, positionLocal.xy.mul(0.5).add(0.5));

  //   mat.colorNode = vec4(vec3(tile), 1)

  //   return mat;
  // }, [])

  useFrame(({ camera }) => {
    if (impactRef.current) {
      impactRef.current.lookAt(camera.position)
    }
  })

  const polarMat = useMemo(() => {
    const mat = new MeshBasicNodeMaterial()
    mat.transparent = true

    // const fresnelPower = float(3.0);
    const orangeGlow = color('#ffa600').mul(20)

    const fade = pow(normalGeometry.z.oneMinus(), 0.5)

    const progress = time.mod(1)

    const vUv = positionLocal.xy.mul(0.5).add(0.5)

    const centeredUv = vUv.sub(0.5)
    const angle = atan(centeredUv.y, centeredUv.x)
    const radius = length(centeredUv)

    const invRadius = radius.oneMinus()
    const warpedRadius = pow(radius, float(1))

    const speed = float(0.3)
    const radialPhase = warpedRadius.sub(time.mul(speed))
    const animatedRadius = fract(radialPhase)

    const normalizedAngle = angle.add(Math.PI).div(PI2).add(time.mul(0))

    const fracAngle = fract(normalizedAngle.mul(6))

    const polarUv = vec2(fracAngle, animatedRadius)
    const tile = texture(tileTexture, polarUv)

    mat.colorNode = vec4(orangeGlow, tile.r.sub(fade))

    return mat
  }, [])

  const distortionBackdrop = ({ progress }: { progress: Node }) => {
    const vUv = screenUV

    const fresnelPower = float(2.0)
    const ringCount = float(5.0)
    const distortionStrength = float(0.08)

    const effectIntensity = progress.smoothstep(float(0), float(0.3))

    const fresnelDot = max(
      dot(normalize(positionViewDirection), normalize(normalView)),
      float(0)
    )
    const fresnel = pow(float(1).sub(fresnelDot), fresnelPower)

    const animatedRingCount = ringCount.mul(effectIntensity)
    const ringsRaw = sin(fresnel.mul(animatedRingCount).mul(PI))
    const rings = abs(ringsRaw).mul(effectIntensity)

    const distortDir = normalize(vUv.sub(vec2(0.5, 0.5)))
    const distortion = distortDir.mul(rings).mul(distortionStrength)

    const distortedUvR = vUv.add(distortion.mul(1.2))
    const distortedUvG = vUv.add(distortion)
    const distortedUvB = vUv.add(distortion.mul(0.8))

    const r = viewportSharedTexture(distortedUvR).r
    const g = viewportSharedTexture(distortedUvG).g
    const b = viewportSharedTexture(distortedUvB).b

    return vec3(r, g, b)
  }
  const triplanar = ({
    position,
    normal,
    scale = 1.0,
    map,
  }: {
    position: Node
    normal: Node
    scale: number
    map: Texture
  }) => {
    const pos = position.mul(scale)
    const n = abs(normal)

    // Blend weights (raised to power for sharper blending)
    const weights = pow(n, vec3(4.0))
    const blend = weights.div(weights.x.add(weights.y).add(weights.z))

    // Sample texture from 3 projections
    const texX = texture(map, pos.yz)
    const texY = texture(map, pos.xz)
    const texZ = texture(map, pos.xy)

    // Weighted blend
    return texX.mul(blend.x).add(texY.mul(blend.y)).add(texZ.mul(blend.z))
  }

  const stylizedSphereBackdrop = ({ progress }: { progress: Node }) => {
    // Fresnel: 0 at center, 1 at edges (inverted from before)

    // const normalTarget = vec3(0, 1, 0);
    // const n = normalGeometry;
    // const nDot = dot(n, normalTarget);
    // const nDotClamped = clamp(nDot, 0, 1);

    // const color1 = vec3(0, 0, 0.05);
    // const color2 = vec3(0.01, 0.01, 0.1);
    // const color = mix(color1, color2, nDotClamped);
    // const fresnelBase = abs(dot(normalView, positionViewDirection));
    // const fresnel = pow(float(1).sub(fresnelBase), float(4.0)); // Inverted & squared for edge glow

    // // Purple-blue gradient colors
    // const purple = vec3(0.6, 0.1, 0.9); // Vibrant purple
    // const blue = vec3(0.1, 0.4, 1.0); // Bright blue

    // // Smooth scroll using sine wave (no hard edges)
    // // sin goes -1 to 1, remap to 0-1 with * 0.5 + 0.5
    // const scrollSpeed = float(0.8);
    // const frequency = float(1.0); // How many waves across the surface
    // const wave = sin(
    //   positionWorld.y.mul(frequency).sub(time.mul(scrollSpeed)).mul(PI)
    // );
    // const scrollOffset = wave.mul(0.5).add(0.5); // Remap -1,1 to 0,1

    // // Mix purple to blue based on scroll position
    // const purpleBlueGlow = mix(purple, blue, scrollOffset);

    // // Multiply by fresnel to only show at edges
    // const finalColor = mix(color, purpleBlueGlow.mul(4), fresnel); // Boost intensity

    const color = texture(noiseTexture, positionLocal.xy.sub(time))

    Discard(progress.greaterThanEqual(0.3))

    const finalColor = vec4(vec3(progress), 1)

    return finalColor
  }

  // Spawn swords at 4 uniform positions, all emitting in the same direction
  const spawnAccumulator = useRef(0)

  return (
    <group>
      {/* <VFXParticles
        autoStart={true}
        maxParticles={100}
        position={[0, 0, 0]}
        geometry={cherryBlossomPetalGeometry}
        size={[0.2, 0.3]}
        delay={0.1}
        // Darker bordeaux to lighter white
        colorStart={["#4A0E0E", "#ff0000", "#ffffff"]}
        fadeSize={1}
        fadeOpacity={[1, 0]}
        gravity={[-1, 1, 0]}
        lifetime={4}
        direction={[[0, -0.5], [0, 0], [0, 0]]}
        startPosition={[[-0.3, 0.3], [-0.3, 0.3], [-0.3, 0.3]]}
        speed={0.01}
        friction={1}
        shadow={true}
        rotation={[
          [0, Math.PI * 2],
          [0, Math.PI * 2],
          [0, Math.PI * 2],
        ]}
        intensity={1}
        rotationSpeed={[1, 3]}
        castShadowNode={({color}) => vec4(color.x, color.y, color.z, 1.)}
        // orientToDirection={true}
        // intensity={10}
        // opacityNode={({progress}) => smoothstep(0, 0.9, progress.oneMinus())}
        // backdropNode={_distortionBackdrop}
      />
       <VFXParticles
        autoStart={true}
        maxParticles={1000}
        position={[0, 0, 0]}
        geometry={new SphereGeometry(1, 32, 32)}
        size={0.5}
        delay={0.3}
        colorStart={["#ffdd44", "#ffaa00", "#ff6600"]}
        colorEnd={["#442200", "#221100"]}
        fadeSize={[0.3, 1]}
        fadeOpacity={[1, 1]}
        gravity={[0, -0.5, 0]}
        lifetime={2}
        direction={[[-1, 1], [0, 0], [-1, 1]]}
        startPosition={0}
        speed={0.1}
        friction={1}
        shadow={true}
        // orientToDirection={true}
        // intensity={10}
        softParticles={true}
        softDistance={2}
        opacityNode={({ progress }) => smoothstep(0, 0.9, progress.oneMinus())}
        backdropNode={distortionBackdrop}
      /> */}

      {/*
      <VFXParticles
        autoStart={true}
        maxParticles={100}
        position={[-3, 0, 0]}
        geometry={new SphereGeometry(1, 32, 32)}
        size={0.5}
        delay={0.3}
        colorStart={["#ffdd44", "#ffaa00", "#ff6600"]}
        colorEnd={["#442200", "#221100"]}
        fadeSize={[0, 1]}
        fadeOpacity={[1, 1]}
        gravity={[0, 0, 0]}
        lifetime={2}
        direction={[[-1, 1], [-1, 1], [-1, 1]]}
        startPosition={0}
        speed={0.3}
        friction={0.8}
        shadow={true}
        // orientToDirection={true}
        // intensity={10}
        opacityNode={({ progress }) => smoothstep(0, 0.1, progress.oneMinus())}
        backdropNode={distortionBackdrop}
      /> */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={10}
        position={[0, 0, 0]}
        delay={3}
        geometry={new SphereGeometry(1, 32, 32)}
        size={0.5}
        delay={3}
        colorStart={["#ffdd44", "#ffaa00", "#ff6600"]}
        colorEnd={["#442200", "#221100"]}
        fadeSize={1}
        fadeOpacity={[1, 1]}
        gravity={[0, 0, 0]}
        lifetime={[3, 3]}
        direction={[[-1, 1], [-1, 1], [-1, 1]]}
        startPosition={0}
        speed={0.0}
        // friction={0.8}
        shadow={true}
        // orientToDirection={true}
        // intensity={10}
        colorNode={({progress}) => stylizedSphereBackdrop(({progress}))}
        castShadowNode={({color}) => vec4(color.x, color.y, color.z, 1.)}
      />  */}
      {/*
      <VFXParticles
        autoStart={true}
        maxParticles={3000}
        position={[0, -1, 0]}
        size={[0.3, 0.8]}
        colorStart={["#ff6600", "#ffcc00", "#ff0000"]}
        colorEnd={["#ff0000", "#330000"]}
        fadeSize={[1, 0.2]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0.002, 0]}
        lifetime={[0.4, 0.8]}
        direction={[[-0.3, 0.3], [0.5, 1], [-0.3, 0.3]]}
        speed={[0.01, 0.05]}
        friction={0.97}
        appearance={Appearance.GRADIENT}
        // blending={Blending.ADDITIVE}
        intensity={10}
      /> */}
      {/* <VFXParticles
      debug
        autoStart={true}
        maxParticles={3000}
        position={[0, 1, 0]}
        size={[2, 2]}
        delay={3}
        colorStart={["#ffffff"]}
        fadeSize={[0.2, 1]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0, 0]}
        lifetime={[4, 4]}
        direction={[-1, 1]}
        speed={[0.0001, 0.01]}
        friction={0.7}
        appearance={Appearance.GRADIENT}
        // blending={Blending.ADDITIVE}
        emitCount={100}
        intensity={1}
        alphaMap={smokeTexture}
        flipbook={{ rows: 16, columns: 16 }}
             rotation={[
          [0, Math.PI * 2],
          [0, Math.PI * 2],
          [0, Math.PI * 2],
        ]}
      /> */}

      {/* START POSITION AS DIRECTION demo - burst/explosion effect */}
      {/* Particles spawn in a sphere and move outward in the direction of their spawn offset */}

      {/* Comparison: Same setup WITHOUT startPositionAsDirection */}
      {/* This one uses random directions instead */}

      {/*       <VFXParticles
      <VFXParticles
        autoStart={true}
        maxParticles={500}
        position={[6, -1, 0]}
        size={[0.05, 0.001]}
        delay={0.5}
        colorStart={["#ff6600", "#ffcc00", "#ff0000"]}
        colorEnd={["#ff0000", "#330000"]}
        fadeSize={[1, 0.2]}
        fadeOpacity={[1, 0]}
        gravity={[0, -1, 0]}
        lifetime={[0.4, 0.8]}
        direction={[[-1, 1], [-1, 1], [-1, 1]]}
        speed={[0.1, 0.2]}
        friction={0.85}
        appearance={Appearance.CIRCULAR}
        // blending={Blending.ADDITIVE}
        intensity={10}
        emitCount={500}
      />

      <VFXParticles
        autoStart={true}
        maxParticles={500}
        position={[9, -1, 0]}
        size={[0.1, 0.2]}
        // delay={0.5}
        colorStart={["#00aaff", "#66ccff", "#0066ff"]}
        colorEnd={["#0033aa", "#001144"]}
        fadeSize={[1, 0.2]}
        fadeOpacity={[1, 0]}
        gravity={[0, -3, 0]}
        lifetime={[0.4, 0.8]}
        direction={[[-0.5, 0.5], [0.5, 1], [-0.5, 0.5]]}
        speed={[0.01, 0.1]}
        // friction={1.}

        appearance={Appearance.CIRCULAR}
        // blending={Blending.ADDITIVE}
        intensity={10}
        // emitCount={500}
      /> */}

      {/* <VFXParticles
        autoStart={true}
        maxParticles={500}
        position={[12, -1, 0]}
        geometry={new BoxGeometry(1, 1, 1)}
        size={[0.1, 0.2]}
        colorStart={["#ff00ff", "#aa00ff", "#ff66ff"]}
        colorEnd={["#440044", "#220022"]}
        fadeSize={1} // Single value = no randomness
        fadeOpacity={1} // Single value = no randomness
        gravity={[0, -2, 0]}
        lifetime={[1, 2]}
        direction={[[-0.5, 0.5], [0.5, 1], [-0.5, 0.5]]}
        speed={[0.05, 0.1]}
        friction={0.98}
        shadow={true}
        // Full 3D rotation: [[minX, maxX], [minY, maxY], [minZ, maxZ]]
        rotation={[
          [0, Math.PI * 2],
          [0, Math.PI * 2],
          [0, Math.PI * 2],
        ]}
        castShadowNode={({color}) => vec4(color.x, color.y, color.z, 1.)}
      /> */}

      {/* Sword geometry particles - orient to velocity */}
      {/* <VFXParticles
        ref={swordParticlesRef}
        maxParticles={10000}
        position={[0, 0, 0]}
        geometry={swordGeometry}
        lighting={Lighting.PHYSICAL}
        size={0.5}
        colorStart={["#ffdd44", "#ffaa00", "#ff6600"]}
        colorEnd={["#442200", "#221100"]}
        fadeSize={1}
        fadeOpacity={[1, 1]}
        gravity={[0, -1, 0]}
        lifetime={[2, 4]}
        direction={[[0, 0], [1, 1], [0, 0]]}  // Default upward
        startPosition={0}  // No offset - we control position via spawn
        speed={0.5}

        shadow={true}
        orientToDirection={true}
        friction={{ intensity: [1., 0.], easing: "easeIn" }}
        intensity={1}
      /> */}

      {/* Bouncing spheres with floor collision */}
      {/* <VFXParticles
  geometry={new BoxGeometry(0.1, 0.1, 1.5, 1, 1, 1)}
  position={[0, 0, 0]}
  intensity={4.5}
  size={[0.01, 0.3]}
  fadeSize={[1, 0]}
  colorStart={["#ff0000", "#ff6600", "#ffb30f"]}
  fadeOpacity={[1, 0]}
  gravity={[0.5, 1.9, 0]}
  speed={[0, 0.04]}
  lifetime={[0.4, 0.9]}
  friction={{
    intensity: 0.1,
    easing: "easeOut"
  }}
  direction={[[-1, 1], [0, 1], [-1, 1]]}
  startPosition={[[0, 0], [0, 0], [0, 0]]}
  rotation={[0, 0]}
  rotationSpeed={[0, 0]}
  orientToDirection={true}
  appearance="default"
  blending={2}
  lighting="basic"
  emitterShape={1}
  emitterRadius={[0, 1]}
  emitterAngle={0.7853981633974483}
  emitterHeight={[0, 1]}
  emitterDirection={[0, 1, 0]}
  turbulence={{
    intensity: 0.08,
    frequency: 1.99,
    speed: 0.19
  }}
/> */}

      {/* <VFXParticles
  position={[-2.6, 0, 0]}
  delay={0.12}
  intensity={3.1}
  size={[0.1, 0.3]}
  fadeSize={[1, 1]}
  colorStart={["#ff0000"]}
  fadeOpacity={[1, 1]}
  gravity={[0, 0.7, 0]}
  speed={[0.01, 0.01]}
  lifetime={[1, 2]}
  friction={{
    intensity: 0,
    easing: "linear"
  }}
  direction={[[-12.5, 12.5], [-1, 1], [-1, 1]]}
  startPosition={[[-1, 1], [-1, 1], [-1, 1]]}
  rotation={[0, 0]}
  rotationSpeed={[[0.1, 2], [0.1, 2], [0.1, 1.9]]}
  appearance="gradient"
  blending={2}
  lighting="basic"
  shadow={true}
  emitterShape={1}
  emitterRadius={[0, 1]}
  emitterAngle={0.7853981633974483}
  emitterHeight={[0, 1]}
  emitterDirection={[0, 1, 0]}
  attractToCenter={true}
  debug
/> */}
      {/* <VFXParticles
  geometry={new ConeGeometry(0.3, 3.2, 4, 1)}
  maxParticles={1000}
  position={[0, 0, 0]}
  emitCount={100}
  delay={1.78}
  intensity={5.8}
  size={[0.1, 0.4]}
  fadeSize={[0, 1]}
  fadeSizeCurve={{
    points: [
      {
        pos: [0, 0],
        handleOut: [0, 0]
      },
      {
        pos: [1, 1],
        handleIn: [-1.5437627513781673, -0.12376516518516154]
      }
    ]
  }}
  colorStart={["#ffa25b"]}
  fadeOpacity={[1, 0]}
  fadeOpacityCurve={{
    points: [
      {
        pos: [0, 1],
        handleOut: [0.70039794921875, -0.37296874999999996]
      },
      {
        pos: [1, 0],
        handleIn: [-0.10091957976483543, 0.31418981272487023]
      }
    ]
  }}
  gravity={[0, 0, 0]}
  speed={[0.1, 2.63]}
  lifetime={[0.4, 0.4]}
  velocityCurve={{
    points: [
      {
        pos: [0, 1],
        handleOut: [0.02539794921875, -0.8136929321289063]
      },
      {
        pos: [1, 0],
        handleIn: [-0.687357, -8.417695499215272e-17]
      }
    ]
  }}
  startPosition={[[0, 0], [0, 0], [0, 0]]}
  startPositionAsDirection={true}
  rotation={[0, 0]}
  rotationSpeed={[0, 0]}
  orientToDirection={true}
  orientAxis="y"
  appearance="gradient"
  blending={1}
  lighting="standard"
  emitterShape={2}
  emitterRadius={[0, 0.77]}
  emitterAngle={0.7853981633974483}
  emitterHeight={[0, 1]}
  emitterDirection={[0, 1, 0]}
/> */}
      {/* Curve Baking Demo - Shows fadeSizeCurve and velocityCurve features */}
      <VFXParticles
        curveTexturePath={'/vfx-curve.bin'}
        speed={[2.34, 2.34]}
        appearance="gradient"
        lighting="standard"
        emitterShape={1}
      />
      {/* <VFXParticles
        // debug={true}
        autoStart={true}
        maxParticles={100}
        position={[-1, 1, 0]}
        geometry={sphereGeometry}
        lighting={Lighting.STANDARD}
        size={[0.1, 0.5]}
        delay={0.5}
        colorStart={["#ff4466", "#44ff66", "#4466ff", "#ffff44"]}
        colorEnd={["#662233", "#226633", "#223366", "#666622"]}
        fadeSize={[1, 1]}
        fadeOpacity={[1, 0]}
        gravity={[0, -9.81, 0]}
        lifetime={[8, 12]}
        direction={[[-1, 1], [0, 0.5], [-1, 1]]}
        startPosition={[[-3, 3], [0, 0], [-3, 3]]}
        speed={0.1}
        emitCount={10}
        shadow={true}
        castShadowNode={({color}) => vec4(color.x, color.y, color.z, 1.) }
        collision={{
          plane: { y: -1 },
          bounce: 0.8,
          friction: 0.95,
          die: false,
          sizeBasedGravity: 4,
        }}
      /> */}

      {/* SPHERE emitter with TURBULENCE - swirling magical orb */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={500}
        position={[-12, 0.5, 0]}
        size={[0.1, 0.2]}
        delay={0.02}
        colorStart={["#00ffff", "#0088ff", "#ffffff"]}
        colorEnd={["#0044aa", "#002266"]}
        fadeSize={[1, 0.5]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0, 0]}
        lifetime={[2, 3]}
        direction={[[0, 0], [0, 0], [0, 0]]}
        speed={0}
        friction={0.99}
        appearance={Appearance.CIRCULAR}
        intensity={8}
        emitterShape={EmitterShape.SPHERE}
        emitterRadius={[0.5, 1]}
        emitterSurfaceOnly={false}
        turbulence={{
          intensity: 0.8,
          frequency: 1.5,
          speed: 0.5
        }}
      /> */}

      {/* CONE emitter - fire/fountain effect */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={1000}
        position={[-15, -1, 0]}
        size={[0.1, 0.2]}
        delay={0.01}
        colorStart={["#ff6600", "#ffcc00", "#ff3300"]}
        colorEnd={["#ff0000", "#330000"]}
        fadeSize={[1, 0.5]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0.01, 0]}
        lifetime={[0.5, 1]}
        direction={[[0, 0], [1, 1], [0, 0]]}
        speed={[0.01, 0.02]}
        friction={0.98}
        appearance={Appearance.GRADIENT}
        intensity={8}
        emitterShape={EmitterShape.CONE}
        emitterRadius={[0, 0.5]}
        emitterAngle={Math.PI / 6} // 30 degree cone
        emitterHeight={[0, 0.5]}
        emitterDirection={[0, 1, 0]}
        turbulence={{
          intensity: 0.2,
          frequency: 0.2,
          speed: 0.1
        }}
      /> */}

      {/* DISK emitter - ground smoke/portal effect */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={300}
        position={[-18, -1, 0]}
        size={[0.2, 0.5]}
        delay={0.03}
        colorStart={["#8844ff", "#aa66ff", "#ffffff"]}
        colorEnd={["#220044", "#110022"]}
        fadeSize={[0.3, 1]}
        fadeOpacity={[1, 0]}
        gravity={[0, 1, 0]}
        lifetime={[1.5, 2.5]}
        direction={[[-0.2, 0.2], [0.5, 1], [-0.2, 0.2]]}
        speed={[0.03, 0.08]}
        friction={0.}
        appearance={Appearance.GRADIENT}
        intensity={5}
        emitterShape={EmitterShape.DISK}
        emitterRadius={[0, 1.2]}
        emitterDirection={[0, 0, 1]}
      /> */}

      {/* EDGE emitter - laser/beam sparks */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={300}
        position={[-21, 0, 0]}
        size={[0.03, 0.08]}
        delay={0.05}
        colorStart={["#00ff00", "#88ff88", "#ffffff"]}
        colorEnd={["#004400", "#002200"]}
        fadeSize={[1, 0.2]}
        fadeOpacity={[1, 0]}
        gravity={[0, -2, 0]}
        lifetime={[0.3, 0.6]}
        direction={[[-0.5, 0.5], [-0.5, 0.5], [-0.5, 0.5]]}
        speed={[0.05, 0.15]}
        friction={0.95}
        appearance={Appearance.CIRCULAR}
        intensity={10}
        emitterShape={EmitterShape.EDGE}
        startPosition={[[0, 0], [-1, 1], [0, 0]]}
      /> */}

      {/* POINT emitter - simple sparks */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={100}
        position={[-24, 0, 0]}
        size={[0.05, 0.1]}
        delay={0.2}
        colorStart={["#ffff00", "#ffffff"]}
        colorEnd={["#ff6600", "#331100"]}
        fadeSize={[1, 0.3]}
        fadeOpacity={[1, 0]}
        gravity={[0, -3, 0]}
        lifetime={[0.5, 1]}
        direction={[[-1, 1], [0.5, 1], [-1, 1]]}
        speed={[0.1, 0.2]}
        friction={0.98}
        appearance={Appearance.CIRCULAR}
        intensity={8}
        emitterShape={EmitterShape.POINT}
        emitCount={10}
      /> */}

      {/* TURBULENCE smoke demo - swirling smoke rising */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={300}
        position={[-27, -1, 0]}
        size={[0.3, 0.6]}
        delay={0.05}
        colorStart={["#666666", "#888888", "#aaaaaa"]}
        colorEnd={["#333333", "#222222"]}
        fadeSize={[0.5, 1.5]}
        fadeOpacity={[0.6, 0]}
        gravity={[0, 0.5, 0]}
        lifetime={[3, 5]}
        direction={[[-0.1, 0.1], [0.3, 0.5], [-0.1, 0.1]]}
        speed={[0.02, 0.05]}
        friction={0.995}
        appearance={Appearance.GRADIENT}
        intensity={1}
        emitterShape={EmitterShape.DISK}
        emitterRadius={[0, 0.3]}
        emitterDirection={[0, 1, 0]}
        turbulence={{
          intensity: 1.2,
          frequency: 0.8,
          speed: 0.3
        }}
      /> */}

      {/* ATTRACT TO CENTER - simple mode, particles reach center when they die */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={500}
        position={[0, 0, 0]}
        size={[0.1, 0.2]}
        delay={0.02}
        colorStart={["#ff00ff", "#ff66ff", "#ffffff"]}
        colorEnd={["#660066", "#330033"]}
        fadeSize={[1, 0.3]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0, 0]}
        lifetime={[1, 3]}
        friction={1}
        appearance={Appearance.CIRCULAR}
        intensity={5}
        emitterShape={EmitterShape.SPHERE}
        emitterRadius={[2, 3]}
        attractToCenter={true}
      /> */}

      {/* ATTRACT TO CENTER - with turbulence for swirling effect */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={400}
        position={[5, 0, 0]}
        size={[0.08, 0.15]}
        delay={0.0}
        colorStart={["#00ffaa", "#66ffcc", "#ffffff"]}
        colorEnd={["#006644", "#003322"]}
        fadeSize={[1, 0.5]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0, 0]}
        lifetime={[2, 4]}
        friction={1}
        appearance={Appearance.CIRCULAR}
        intensity={6}
        emitterShape={EmitterShape.SPHERE}
        emitterRadius={[1.5, 2.5]}
        attractToCenter={true}
        // turbulence={{
        //   intensity: 0.3,
        //   frequency: 2,
        //   speed: 0.5
        // }}
      /> */}
      {/*
      <VFXParticles
        autoStart={true}
        maxParticles={300}
        position={[10, 0, 0]}
        size={[0.1, 0.18]}
        delay={0.04}
        colorStart={["#ffaa00", "#ffdd66", "#ffffff"]}
        colorEnd={["#663300", "#331100"]}
        fadeSize={[0.5, 1]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0, 0]}
        lifetime={[1, 2]}
        friction={1}
        appearance={Appearance.CIRCULAR}
        intensity={8}
        emitterShape={EmitterShape.DISK}
        emitterRadius={[0, 2]}
        emitterDirection={[0, 1, 0]}
        attractToCenter={true}
      /> */}

      {/* SOFT PARTICLES demo - fades near floor/geometry */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={3000}
        position={[-5, -1, 0]}
        size={[0.4, 0.8]}
        // delay={}
        colorStart={["#aaaaaa", "#888888", "#666666"]}
        colorEnd={["#444444", "#333333"]}
        fadeSize={[0.5, 1.2]}
        fadeOpacity={[0.8, 1]}
        gravity={[0, -0.5, 0]}
        lifetime={[2, 4]}
        direction={[[-0.3, 0.3], [0.5, 1], [-0.3, 0.3]]}
        speed={[0.02, 0.05]}
        friction={0.99}
        appearance={Appearance.GRADIENT}
        intensity={1}
        emitterShape={EmitterShape.DISK}
        emitterRadius={[0, 0.5]}
        emitterDirection={[0, 1, 0]}
        softParticles={true}
        softDistance={2}
      /> */}

      {/* FRICTION CURVE demo - particles start fast (high friction=0.99), end slow (low friction=0.8) */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={300}
        position={[15, 0, 0]}
        size={[0.1, 0.2]}
        delay={0.05}
        colorStart={["#00aaff", "#66ccff", "#ffffff"]}
        colorEnd={["#004466", "#002233"]}
        fadeSize={[1, 0.5]}
        fadeOpacity={[1, 0]}
        gravity={[0, -0.5, 0]}
        lifetime={[2, 3]}
        direction={[[-1, 1], [0.5, 1], [-1, 1]]}
        speed={[0.15, 0.25]}
        friction={[0.99, 0.7]}
        frictionEasing="easeIn"
        appearance={Appearance.CIRCULAR}
        intensity={5}
        emitterShape={EmitterShape.POINT}
        emitCount={5}
      /> */}

      {/* FRICTION CURVE demo 2 - easeOut: starts slow, friction kicks in fast */}
      {/* <VFXParticles
        autoStart={true}
        maxParticles={200}
        position={[18, 0, 0]}
        size={[0.15, 0.25]}
        delay={0.1}
        colorStart={["#ff6600", "#ffaa44", "#ffffff"]}
        colorEnd={["#662200", "#331100"]}
        fadeSize={[0.8, 1.2]}
        fadeOpacity={[1, 0]}
        gravity={[0, 0.2, 0]}
        lifetime={[3, 4]}
        direction={[[-0.5, 0.5], [0, 0.3], [-0.5, 0.5]]}
        speed={[0.1, 0.15]}
        friction={[1, 0.85]}
        frictionEasing="easeOut"
        appearance={Appearance.GRADIENT}
        intensity={4}
        emitterShape={EmitterShape.DISK}
        emitterRadius={[0, 0.3]}
        emitterDirection={[0, 1, 0]}
      /> */}
    </group>
  )
}

useGLTF.preload('/sword1-transformed.glb')
