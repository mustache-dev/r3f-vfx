import * as THREE from 'three/webgpu';
import { pass, mrt, output, velocity, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

export function WebGPUPostProcessing({
  bloomStrength = 0.15,
  bloomRadius = 0.1,
  bloomThreshold = 0,
  motionBlurAmount = 0.01,
  enableSmaa = true,
  enableMotionBlur = false,
}) {
  const { gl: renderer, scene, camera, size } = useThree();
  const postProcessingRef = useRef(null);

  useEffect(() => {
    if (!renderer || !scene || !camera) return;

    // Create scene pass with filters
    const scenePass = pass(scene, camera, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    scenePass.setMRT(
      mrt({
        output: output,
        velocity: velocity,
      })
    );

    const scenePassColor = scenePass.getTextureNode('output');
    const scenePassVelocity = scenePass.getTextureNode('velocity');

    const blurAmount = uniform(motionBlurAmount);
    const velocityScaled = scenePassVelocity.mul(blurAmount);
    const afterMotionBlur = enableMotionBlur
      ? motionBlur(scenePassColor, velocityScaled)
      : scenePassColor;

    const bloomPass = bloom(
      scenePassColor,
      bloomStrength,
      bloomRadius,
      bloomThreshold
    );
    const withBloom = afterMotionBlur.add(bloomPass);

    const finalOutput = enableSmaa ? smaa(withBloom) : withBloom;

    const postProcessing = new THREE.PostProcessing(renderer);
    postProcessing.outputNode = finalOutput;
    postProcessingRef.current = postProcessing;

    if (postProcessingRef.current.setSize) {
      postProcessingRef.current.setSize(size.width, size.height);
      postProcessingRef.current.needsUpdate = true;
    }

    return () => {
      postProcessingRef.current = null;
    };
  }, [
    renderer,
    scene,
    camera,
    size,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
    motionBlurAmount,
    enableSmaa,
    enableMotionBlur,
  ]);

  useFrame(({ gl, scene, camera }) => {
    if (postProcessingRef.current) {
      gl.clear();
      postProcessingRef.current.render();
    }
  }, 1);

  return null;
}
