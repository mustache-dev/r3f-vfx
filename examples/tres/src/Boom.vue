<script setup lang="ts">
import { useLoop } from '@tresjs/core'
import { VFXParticles, useVFXEmitter } from 'tres-vfx'
import { SRGBColorSpace, TextureLoader, Vector3 } from 'three/webgpu'
import { color, mix, texture, uv, vec3, vec4 } from 'three/tsl'

const { onBeforeRender } = useLoop()
const { emit } = useVFXEmitter('boom')

// Load smoke texture
const smokeTexture = new TextureLoader().load('./smoke-ww.png')
smokeTexture.colorSpace = SRGBColorSpace

// Color node for the boom effect
const blackColor = color('#FFE25B').mul(10)
const whiteColor = color('#FED44C')
const black2 = color('#A0251F').mul(10)
const white2 = color('#692522')
const black3 = color('#ececec')
const white3 = color('#3c3c3c')

const colorNodeFn = ({ progress }: { progress: any }) => {
  const vUv = uv()
  const tileSize = 1.0 / 3.0
  const centerTileUV = vUv.mul(tileSize).add(vec3(tileSize, tileSize, 0))
  const smokeColor = texture(smokeTexture, centerTileUV)
  const grayscale = smokeColor.r
  const smoothProgress = progress.smoothstep(0, 0.5)

  const color1 = mix(blackColor, black2, smoothProgress)
  const color2 = mix(whiteColor, white2, smoothProgress)
  const endProgress = progress.smoothstep(0.5, 1)
  const finalColor1 = mix(color1, black3, endProgress)
  const finalColor2 = mix(color2, white3, endProgress)
  const finalColor = mix(finalColor1, finalColor2, grayscale)

  return vec4(
    finalColor.mul(endProgress.oneMinus()),
    smokeColor.a.sub(endProgress)
  )
}

// Trajectory physics
const gravity = -9.8
const upSpeed = 6
const outSpeed = 3
const vectors = Array.from({ length: 5 }, () => new Vector3())
const velocities = Array.from({ length: 5 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 5
  return new Vector3(
    Math.cos(angle) * outSpeed,
    upSpeed,
    Math.sin(angle) * outSpeed
  )
})

let t = 0

onBeforeRender(({ delta }) => {
  t += delta

  for (let i = 0; i < 5; i++) {
    velocities[i].y += gravity * delta
    vectors[i].addScaledVector(velocities[i], delta)

    emit(vectors[i].toArray() as [number, number, number], 1, {
      emitterShape: 2,
      emitterRadius: [0, 0],
      size: [0.1, 0.3],
      speed: [1.2, 1.2],
    })
  }

  if (t > 2) {
    emit([0, -0.5, 0], 100, {
      emitterShape: 4,
      emitterRadius: [0, 0.01],
      size: [0.3, 0.4],
      speed: [1.2, 1.2],
    })
    emit([0, 0, 0], 100)
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5
      vectors[i].set(0, -0.5, 0)
      velocities[i].set(
        Math.cos(angle) * outSpeed,
        upSpeed,
        Math.sin(angle) * outSpeed
      )
    }
    t = 0
  }
})
</script>

<template>
  <VFXParticles
    :auto-start="false"
    name="boom"
    curve-texture-path="/boom-2.bin"
    :emit-count="100"
    :delay="2"
    :size="[0.52, 0.86]"
    :speed="[0.6, 0.6]"
    :lifetime="[2, 2.5]"
    :start-position-as-direction="true"
    :rotation="[[0, 0], [-Math.PI * 2, Math.PI * 2], [0, 0]]"
    :rotation-speed="[[0, 0], [-3, 3], [0, 0]]"
    appearance="default"
    lighting="basic"
    :emitter-shape="2"
    :emitter-radius="[0, 0.21]"
    :color-node="colorNodeFn"
  />
</template>
