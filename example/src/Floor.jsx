import { useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  cameraPosition,
  positionWorld,
  positionLocal,
  fract,
  vec3,
  vec4,
  float,
  step,
  max,
  abs,
  mix,
  Fn,
  reflector,
} from 'three/tsl';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';

export const Floor = () => {
  const { scene } = useThree();

  // Create reflector for blurred reflection
  const reflection = useMemo(() => {
    const r = reflector({ resolutionScale: 0.3, depth: true, bounces: false });
    r.target.rotateX(-Math.PI / 2);
    r.target.position.y = -1; // Match floor position
    return r;
  }, []);

  // Add reflection target to scene
  useEffect(() => {
    scene.add(reflection.target);
    return () => {
      scene.remove(reflection.target);
    };
  }, [scene, reflection]);

  const mat = useMemo(() => {
    const m = new MeshStandardNodeMaterial({
      transparent: true,
      roughness: 0.8,
      metalness: 0.2,
    });

    const gridSize = float(1.0);
    const lineWidth = float(0.03);

    const gridPos = positionWorld.xz.div(gridSize);
    const gridFract = fract(gridPos);

    const lineX = step(gridFract.x, lineWidth).add(
      step(float(1).sub(gridFract.x), lineWidth)
    );
    const lineZ = step(gridFract.y, lineWidth).add(
      step(float(1).sub(gridFract.y), lineWidth)
    );
    const grid = max(lineX, lineZ);

    const gridColor = vec3(0.1, 0.2, 0.5).add(vec3(0.3, 0.6, 0.8).mul(grid));

    // Blurred reflection composite
    const reflectionColor = Fn(() => {
      const reflectionDepth = reflection.getDepthNode();

      // Blur radius and roughness settings
      const blurRadius = float(0.05);
      const roughnessRange = float(0.15);

      // Sample reflection with depth mask
      const maskReflection = Fn(({ uv }) => {
        const sample = reflection.sample(uv);
        const mask = reflectionDepth.sample(uv);
        return vec4(sample.rgb, sample.a.mul(mask.r));
      });

      // Apply hash blur to reflection
      const reflectionBlurred = hashBlur(maskReflection, blurRadius, {
        repeats: 20,
        premultipliedAlpha: true,
      });

      // Create reflection mask based on depth
      const reflectionMask = reflectionBlurred.a
        .mul(reflectionDepth)
        .remapClamp(0, roughnessRange);
      const reflectionIntensity = float(0.15); // Subtle reflection
      const reflectionMixFactor = reflectionMask.mul(0.8);
      const reflectionFinal = mix(
        reflection.rgb,
        reflectionBlurred.rgb,
        reflectionMixFactor
      ).mul(reflectionIntensity);

      // Mix grid color with reflection
      return gridColor.add(reflectionFinal);
    })();

    m.colorNode = gridColor;

    const zDist = abs(positionWorld.z.sub(cameraPosition.z));
    const dropAmount = zDist.mul(zDist).mul(0.008);

    m.positionNode = positionLocal.add(vec3(0, 0, dropAmount.negate()));
    return m;
  }, [reflection]);

  return (
    <mesh
      receiveShadow
      material={mat}
      position={[0, -1, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[100, 100, 200, 200]} />
    </mesh>
  );
};
