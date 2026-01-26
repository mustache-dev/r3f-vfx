import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import {
  positionWorld,
  uniform,
  float,
  vec3,
  smoothstep,
  length,
  texture,
  time,
  positionLocal,
  normalGeometry,
} from 'three/tsl';
import { MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import { noiseTexture } from './noiseTexture';

const MAX_WAVES = 20;

const currentTimeUniform = uniform(0);

const waveUniforms = Array.from({ length: MAX_WAVES }, () => ({
  clickPos: uniform(new Vector3(0, 0, 0)),
  clickTime: uniform(-999),
}));

let nextWaveIndex = 0;
let lastWaveTime = 0;
const THROTTLE_MS = 100;

const createWaveMaterial = () => {
  const mat = new MeshBasicNodeMaterial({
    transparent: true,
    side: 2,
  });

  const speed = float(3.0);
  const thickness = float(0.2);
  const fadeDuration = float(6.0);
  const noiseScale = float(1);
  const noiseFreq = float(0.01);

  const noiseUV = positionWorld.xy.add(positionWorld.yz).mul(noiseFreq);
  const noise1 = texture(noiseTexture, noiseUV).r.sub(0.5).mul(2);
  const noise2 = texture(noiseTexture, noiseUV.mul(2.3).add(0.5))
    .r.sub(0.5)
    .mul(2);
  const combinedNoise = noise1.add(noise2.mul(0.5)).mul(noiseScale);

  let totalMask = float(0);

  for (let i = 0; i < MAX_WAVES; i++) {
    const { clickPos, clickTime } = waveUniforms[i];

    const baseDistance = length(positionWorld.sub(clickPos));
    const distFromClick = baseDistance.add(combinedNoise);

    const timeSinceClick = currentTimeUniform.sub(clickTime);
    const waveFront = timeSinceClick.mul(speed);

    const innerEdge = waveFront.sub(thickness);
    const outerEdge = waveFront.add(thickness);

    const mask = smoothstep(innerEdge, waveFront, distFromClick).sub(
      smoothstep(waveFront, outerEdge, distFromClick)
    );

    const fadeOut = float(1.0).sub(timeSinceClick.div(fadeDuration)).max(0);

    const isActive = timeSinceClick.greaterThan(0).toFloat();

    totalMask = totalMask.add(mask.mul(fadeOut).mul(isActive));
  }

  totalMask = totalMask.min(1.0);

  const waveColor = vec3(0.4, 0.9, 1.0).mul(totalMask);

  mat.colorNode = waveColor;
  mat.positionNode = positionLocal.add(waveColor);

  return mat;
};

const waveMaterial = createWaveMaterial();

export const WobblySphere = () => {
  const meshRef = useRef();

  useFrame((state) => {
    currentTimeUniform.value = state.clock.elapsedTime;
  });

  const handlePointerMove = (event) => {
    const now = performance.now();
    if (now - lastWaveTime < THROTTLE_MS) return;
    lastWaveTime = now;

    const clickPoint = event.point.clone();

    const wave = waveUniforms[nextWaveIndex];
    wave.clickPos.value.copy(clickPoint);
    wave.clickTime.value = currentTimeUniform.value;

    nextWaveIndex = (nextWaveIndex + 1) % MAX_WAVES;
  };

  return (
    <mesh
      ref={meshRef}
      material={waveMaterial}
      onPointerMove={handlePointerMove}
    >
      <sphereGeometry args={[3, 64, 64]} />
    </mesh>
  );
};
