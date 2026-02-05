<script setup lang="ts">
import { toValue } from 'vue'
import { WebGPURenderer } from 'three/webgpu'
import SceneLight from './SceneLight.vue'
import Floor from './Floor.vue'
import Player from './Player.vue'
import Boom from './Boom.vue'
import Particles from './Particles.vue'

const createWebGPURenderer = (ctx: { canvas: any }) => {
  const canvas = toValue(ctx.canvas)
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    forceWebGL: false,
  })
  return renderer
}
</script>

<template>
  <TresCanvas :renderer="createWebGPURenderer" window-size shadows>
    <SceneLight />
    <Floor />
    <Player />
    <Boom />
    <TresGroup :position="[5, 0, 0]">
      <Particles />
    </TresGroup>
  </TresCanvas>
</template>
